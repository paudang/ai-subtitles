const audioSourceSelect = document.getElementById('audioSource');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const historyBox = document.getElementById('history-box');
const currentEn = document.getElementById('current-en');
const currentVi = document.getElementById('current-vi');

let mediaRecorder;
let ws;
let isRecording = false;

// Performance Constraints (DOM Virtualization limit)
const MAX_HISTORY_NODES = 50; 

// VAD Variables
let audioContext;
let analyser;
let microphone;
let javascriptNode;
let silenceStart = Date.now();
const SILENCE_DELAY = 600; // ms (Giảm xuống 600ms để bắt được những khoảng nghỉ/thở cực ngắn của người nói nhanh)
const MAX_CHUNK_TIME = 12000; // Giới hạn 12 giây cho một câu quá dài
const VOLUME_THRESHOLD = 3; 
let isSpeaking = false;
let mixContext = null; // Manage mixContext lifecycle
let lastFinalTranslation = null; // Store last translation to push seamlessly
let isEndingSentence = false;

function updateStatus(state, text) {
    statusIndicator.className = '';
    if (state) statusIndicator.classList.add(`status-${state}`);
    statusText.innerText = text;
}

async function getMicrophones() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
        
        audioInputDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${audioSourceSelect.length + 1}`;
            audioSourceSelect.appendChild(option);
        });
        
        // Add special option: Mix 2 audio streams
        const mixOption = document.createElement('option');
        mixOption.value = 'mic_and_system';
        mixOption.text = '🎤 Mic + 💻 System Audio (Share Tab)';
        audioSourceSelect.appendChild(mixOption);
    } catch (err) {
        console.error("[ERROR] Failed to enumerate devices:", err);
    }
}

function connectWebSocket() {
    ws = new WebSocket(`ws://${window.location.host}/ws`);
    
    ws.onopen = () => {
        console.log("[WS] Connected to Server");
        updateStatus('active', 'Connected');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // If AI returns empty (due to noise or silence), just keep previous state
        if (!data.en || data.en.trim() === "") {
            if (isRecording) updateStatus('listening', 'Listening...');
            return;
        }
        
        if (data.status === "partial") {
            // Render English only for real-time box (like Zoom)
            currentEn.innerText = data.en;
            currentVi.innerHTML = ''; // Keep Vietnamese empty in the bottom box
            
            // NO fade-up animation here to prevent jerkiness!
        } else {
            // It's final! Instantly push to history!
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item fade-up';
            historyItem.innerHTML = `
                <div class="en-text">${data.en}</div>
                <div class="vi-text">${data.vi}</div>
            `;
            historyBox.appendChild(historyItem);
            
            while (historyBox.children.length > MAX_HISTORY_NODES) {
                historyBox.removeChild(historyBox.firstChild);
            }
            historyBox.scrollTop = historyBox.scrollHeight;
            
            // Clear the real-time box so it's clean for the next sentence
            currentEn.innerHTML = '';
            currentVi.innerHTML = '';
        }
        
        if (isRecording) {
            updateStatus('listening', 'Listening...');
        }
    };
    
    ws.onclose = () => {
        console.log("[WS] Disconnected");
        updateStatus('error', 'Reconnecting...');
        setTimeout(connectWebSocket, 3000); // Exponential backoff in production
    };
}

async function startListening() {
    if (isRecording) return;
    
    const deviceId = audioSourceSelect.value;
    let stream;

    try {
        if (deviceId === 'mic_and_system') {
            // 1. Get Microphone stream
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // 2. Get System Audio stream (via browser's Screen Share feature)
            // Note: User must check the "Share tab audio" box
            const sysStream = await navigator.mediaDevices.getDisplayMedia({
                video: true, // API requires video
                audio: true 
            });
            
            if (sysStream.getAudioTracks().length === 0) {
                alert("You FORGOT to check the 'Share tab audio' box when selecting the screen!\nPlease Stop and try again.");
                sysStream.getTracks().forEach(t => t.stop());
                micStream.getTracks().forEach(t => t.stop());
                return;
            }
            
            // 3. Mix these 2 streams together using Web Audio API
            mixContext = new AudioContext();
            const destination = mixContext.createMediaStreamDestination();
            
            const micSource = mixContext.createMediaStreamSource(micStream);
            const sysSource = mixContext.createMediaStreamSource(sysStream);
            
            micSource.connect(destination);
            sysSource.connect(destination);
            
            stream = destination.stream;
            
            // Save tracks to stop them completely later
            stream.micTracks = micStream.getTracks();
            stream.sysTracks = sysStream.getTracks();
        } else {
            const constraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true
            };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        }
        
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(event.data);
            }
            if (isEndingSentence && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: "end_sentence" }));
                isEndingSentence = false;
            }
        };

        // Initialize AudioContext for VAD
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;

        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);
        
        mediaRecorder.start(300); // 300ms timeslice for ultra-fast real-time streaming
        isRecording = true;
        isSpeaking = false;
        isEndingSentence = false;
        
        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus('listening', 'Listening...');

        let speechStart = 0;

        javascriptNode.onaudioprocess = function(event) {
            const input = event.inputBuffer.getChannelData(0);
            let sum = 0.0;
            for (let i = 0; i < input.length; ++i) {
                sum += input[i] * input[i];
            }
            let volume = Math.sqrt(sum / input.length) * 100;
            
            if (volume > VOLUME_THRESHOLD) {
                silenceStart = Date.now();
                isSpeaking = true;
            } else {
                if (isSpeaking) {
                    let silenceDuration = Date.now() - silenceStart;
                    let speakDuration = Date.now() - speechStart;
                    
                    // Cắt bình thường nếu im lặng > 600ms
                    // Ép cắt (Desperate cut) nếu câu dài > 12s VÀ có một khoảng lặng rất nhỏ (250ms) giữa các từ
                    // Điều này ĐẢM BẢO tuyệt đối không bao giờ cắt vỡ giữa chừng một từ đang phát âm!
                    if (silenceDuration > SILENCE_DELAY || (speakDuration > MAX_CHUNK_TIME && silenceDuration > 250)) {
                        if(mediaRecorder.state === 'recording') {
                            isEndingSentence = true;
                            mediaRecorder.stop();
                            mediaRecorder.start(300);
                        }
                        speechStart = Date.now(); // Reset start time for new sentence
                        silenceStart = Date.now();
                        isSpeaking = false;
                    }
                }
            }
        };

    } catch (err) {
        console.error("[ERROR] Mic access denied:", err);
        alert("Microphone access is required for AI Subtitles.");
    }
}

function stopListening() {
    if (!isRecording) return;
    
    mediaRecorder.stop();
    
    if (mediaRecorder.stream.getTracks) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    if (mediaRecorder.stream.micTracks) {
        mediaRecorder.stream.micTracks.forEach(track => track.stop());
    }
    if (mediaRecorder.stream.sysTracks) {
        mediaRecorder.stream.sysTracks.forEach(track => track.stop());
    }
    
    if (audioContext) {
        javascriptNode.disconnect();
        analyser.disconnect();
        microphone.disconnect();
        audioContext.close();
    }
    
    if (mixContext) {
        mixContext.close();
        mixContext = null;
    }
    
    isRecording = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus('active', 'Stopped');
}

// Init
getMicrophones();
connectWebSocket();

startBtn.addEventListener('click', startListening);
stopBtn.addEventListener('click', stopListening);
