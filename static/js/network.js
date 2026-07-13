import { updateStatus, updateLiveBoxStrictAppend, pushToHistory, clearLiveBox } from './ui.js';
import { State } from './state.js';

let ws;
let latestPartialData = null;

export function connectWebSocket() {
    ws = new WebSocket(`ws://${window.location.host}/ws`);
    
    ws.onopen = () => {
        console.log("[WS] Connected to Server");
        updateStatus('active', 'Connected');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (!data.en || data.en.trim() === "") {
            if (data.status === "final") {
                // Fallback to the last known partial text to prevent "disappearing text"!
                if (latestPartialData && latestPartialData.en && latestPartialData.en.trim() !== "") {
                    data.en = latestPartialData.en;
                    data.vi = latestPartialData.vi || "";
                } else {
                    clearLiveBox();
                    if (State.isRecording) updateStatus('listening', 'Listening...');
                    return;
                }
            } else {
                if (State.isRecording) updateStatus('listening', 'Listening...');
                return;
            }
        }
        
        if (data.status === "partial") {
            latestPartialData = { en: data.en, vi: data.vi };
            updateLiveBoxStrictAppend(data.en);
            
        } else {
            // It's final! 
            pushToHistory(data.en, data.vi);
            clearLiveBox();
            latestPartialData = null; // Reset fallback
        }
        
        if (State.isRecording) {
            updateStatus('listening', 'Listening...');
        }
    };
    
    ws.onclose = () => {
        console.log("[WS] Disconnected");
        updateStatus('error', 'Reconnecting...');
        setTimeout(connectWebSocket, 3000); // Exponential backoff in production
    };
}

export function sendAudioData(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
    }
}

export function sendEndSentence() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "end_sentence" }));
    }
}
