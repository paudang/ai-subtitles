const audioSourceSelect = document.getElementById('audioSource');
const voiceBtn = document.getElementById('voiceBtn');
const iconMic = document.getElementById('icon-mic');
const iconStop = document.getElementById('icon-stop');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const iconMoon = document.getElementById('icon-moon');
const iconSun = document.getElementById('icon-sun');
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
const SILENCE_DELAY = 600; // ms (Lowered to 600ms to catch very short pauses from fast speakers)
const MAX_CHUNK_TIME = 12000; // 12 seconds limit for excessively long sentences
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
        // DO NOT call getUserMedia on page load, it blocks iOS Safari!
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
        
        audioSourceSelect.innerHTML = '<option value="">Default Microphone</option>';
        
        audioInputDevices.forEach(device => {
            if (device.deviceId && device.deviceId !== 'default' && device.deviceId !== '') {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${audioSourceSelect.length}`;
                audioSourceSelect.appendChild(option);
            }
        });
        
        // Add special option: Mix 2 audio streams
        const mixOption = document.createElement('option');
        mixOption.value = 'mic_and_system';
        mixOption.text = 'Mic + System Audio (Share Tab)';
        audioSourceSelect.appendChild(mixOption);
    } catch (err) {
        console.error("[ERROR] Failed to enumerate devices:", err);
    }
}

// BIG TECH SECRET: Word-level DOM Diffing
// Instead of replacing the entire paragraph, we split it into words and spaces.
// We only update the specific TextNode that changed. This prevents the browser from
// destroying and rebuilding the layout tree, completely eliminating jitter/flicker!
function renderSmartText(container, newText) {
    const tokens = newText.split(/(\s+)/);
    const childNodes = container.childNodes;
    
    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        if (i < childNodes.length) {
            // Only update DOM if the text actually changed
            if (childNodes[i].textContent !== token) {
                childNodes[i].textContent = token;
            }
        } else {
            // Append new text node
            container.appendChild(document.createTextNode(token));
        }
        i++;
    }
    
    // Remove any leftover nodes if the new string is shorter (e.g. AI removed words)
    while (childNodes.length > tokens.length) {
        container.removeChild(container.lastChild);
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
            // Apply Big Tech Smart Rendering
            renderSmartText(currentEn, data.en);
            
            currentVi.innerHTML = ''; // Keep Vietnamese empty in the bottom box
            
            // NO fade-up animation here to prevent jerkiness!
        } else {
            // It's final! 
            // We NO LONGER merge sentences. The user wants strict alternating (En, Vi, En, Vi).
            // This also completely prevents massive paragraphs from forming and eliminates all replace jitter.
            
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item fade-up';
            historyItem.innerHTML = `
                <div class="en-text">${data.en}</div>
                <div class="vi-text">${data.vi}</div>
            `;
            // Append it to historyBox
            historyBox.appendChild(historyItem);
            
            while (historyBox.children.length > MAX_HISTORY_NODES) {
                historyBox.removeChild(historyBox.firstChild);
            }
            
            // Smooth scroll to bottom
            historyBox.scrollTo({ top: historyBox.scrollHeight, behavior: 'smooth' });
            
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

    // VERY IMPORTANT: Initialize AudioContext synchronously inside the click handler!
    // If we wait for getDisplayMedia() to resolve, the user gesture expires (takes > 2s)
    // and the browser will create the AudioContext in a "suspended" state (SILENCE).
    if (deviceId === 'mic_and_system') {
        mixContext = new AudioContext();
    }
    audioContext = new AudioContext(); // For VAD

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

        // Initialize VAD Analyser using the already-created audioContext
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
        
        voiceBtn.classList.add('recording');
        iconMic.style.display = 'none';
        iconStop.style.display = 'block';
        updateStatus('listening', 'Listening...');
        
        // Clear the initial placeholder text once mic is successfully granted
        currentEn.innerText = '';
        currentVi.innerHTML = '';

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
                    
                    // Normal chunking if silence > 600ms
                    // Desperate cut if sentence is too long (> 12s) AND there is a very small pause (250ms) between words
                    // This ENSURES we never accidentally cut in the middle of a spoken word!
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
        alert(`Microphone access failed: ${err.name} - ${err.message}\n\nPlease tap the 'aA' icon in Safari, select 'Website Settings', allow Microphone, and refresh the page.`);
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
    voiceBtn.classList.remove('recording');
    iconMic.style.display = 'block';
    iconStop.style.display = 'none';
    updateStatus('active', 'Stopped');
}

// Event Listeners
voiceBtn.addEventListener('click', () => {
    if (isRecording) {
        stopListening();
    } else {
        startListening();
    }
});

settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
});

// Theme Toggle Logic
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (theme === 'light') {
        iconMoon.style.display = 'none';
        iconSun.style.display = 'block';
    } else {
        iconMoon.style.display = 'block';
        iconSun.style.display = 'none';
    }
}

themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
});

// Init
const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);
getMicrophones();
connectWebSocket();
