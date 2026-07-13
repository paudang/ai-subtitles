import { DOM } from './dom.js';
import { State } from './state.js';
import { SILENCE_DELAY, MAX_CHUNK_TIME, VOLUME_THRESHOLD } from './constants.js';
import { updateStatus, clearLiveBox } from './ui.js';
import { sendAudioData, sendEndSentence } from './network.js';

let mediaRecorder;
let audioContext;
let analyser;
let microphone;
let javascriptNode;
let mixContext = null;

let silenceStart = Date.now();
let isSpeaking = false;
let isEndingSentence = false;

export async function getMicrophones() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
        
        DOM.audioSourceSelect.innerHTML = '<option value="">Default Microphone</option>';
        
        audioInputDevices.forEach(device => {
            if (device.deviceId && device.deviceId !== 'default' && device.deviceId !== '') {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${DOM.audioSourceSelect.length}`;
                DOM.audioSourceSelect.appendChild(option);
            }
        });
        
        const mixOption = document.createElement('option');
        mixOption.value = 'mic_and_system';
        mixOption.text = 'Mic + System Audio (Share Tab)';
        DOM.audioSourceSelect.appendChild(mixOption);
    } catch (err) {
        console.error("[ERROR] Failed to enumerate devices:", err);
    }
}

export async function startListening() {
    if (State.isRecording) return;
    
    const deviceId = DOM.audioSourceSelect.value;
    let stream;

    if (deviceId === 'mic_and_system') {
        mixContext = new AudioContext();
    }
    audioContext = new AudioContext(); 

    try {
        if (deviceId === 'mic_and_system') {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const sysStream = await navigator.mediaDevices.getDisplayMedia({
                video: true, 
                audio: true 
            });
            
            if (sysStream.getAudioTracks().length === 0) {
                alert("You FORGOT to check the 'Share tab audio' box when selecting the screen!\nPlease Stop and try again.");
                sysStream.getTracks().forEach(t => t.stop());
                micStream.getTracks().forEach(t => t.stop());
                return;
            }
            
            const destination = mixContext.createMediaStreamDestination();
            const micSource = mixContext.createMediaStreamSource(micStream);
            const sysSource = mixContext.createMediaStreamSource(sysStream);
            
            micSource.connect(destination);
            sysSource.connect(destination);
            
            stream = destination.stream;
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
            if (event.data.size > 0) {
                sendAudioData(event.data);
            }
            if (isEndingSentence) {
                sendEndSentence();
                isEndingSentence = false;
            }
        };

        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;

        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);
        
        mediaRecorder.start(300); 
        State.isRecording = true;
        isSpeaking = false;
        isEndingSentence = false;
        
        DOM.voiceBtn.classList.add('recording');
        DOM.iconMic.style.display = 'none';
        DOM.iconStop.style.display = 'block';
        updateStatus('listening', 'Listening...');
        
        clearLiveBox();

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
                if (!isSpeaking) {
                    isSpeaking = true;
                    speechStart = Date.now();
                }
                
                if (Date.now() - speechStart > MAX_CHUNK_TIME * 1.5) {
                    if(mediaRecorder.state === 'recording') {
                        isEndingSentence = true;
                        mediaRecorder.stop();
                        mediaRecorder.start(300);
                    }
                    speechStart = Date.now();
                    isSpeaking = false;
                }
            } else {
                if (isSpeaking) {
                    let silenceDuration = Date.now() - silenceStart;
                    let speakDuration = Date.now() - speechStart;
                    
                    if (silenceDuration > SILENCE_DELAY || (speakDuration > MAX_CHUNK_TIME && silenceDuration > 250)) {
                        if(mediaRecorder.state === 'recording') {
                            isEndingSentence = true;
                            mediaRecorder.stop();
                            mediaRecorder.start(300);
                        }
                        speechStart = Date.now();
                        silenceStart = Date.now();
                        isSpeaking = false;
                    }
                } else {
                    if (Date.now() - silenceStart > 5000) {
                        if(mediaRecorder.state === 'recording') {
                            isEndingSentence = true;
                            mediaRecorder.stop();
                            mediaRecorder.start(300);
                        }
                        silenceStart = Date.now();
                    }
                }
            }
        };

    } catch (err) {
        console.error("[ERROR] Mic access denied:", err);
        alert(`Microphone access failed: ${err.name} - ${err.message}\n\nPlease tap the 'aA' icon in Safari, select 'Website Settings', allow Microphone, and refresh the page.`);
    }
}

export function stopListening() {
    if (!State.isRecording) return;
    
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
    
    State.isRecording = false;
    DOM.voiceBtn.classList.remove('recording');
    DOM.iconMic.style.display = 'block';
    DOM.iconStop.style.display = 'none';
    updateStatus('active', 'Stopped');
}
