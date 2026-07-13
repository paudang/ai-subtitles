import { DOM } from './dom.js';
import { State } from './state.js';
import { toggleTheme, setTheme } from './ui.js';
import { connectWebSocket } from './network.js';
import { getMicrophones, startListening, stopListening } from './audio.js';

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Restore Theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    
    // Connect to WebSocket Server
    connectWebSocket();
    
    // Get Audio Sources
    getMicrophones();
});

// Event Listeners
DOM.voiceBtn.addEventListener('click', () => {
    if (State.isRecording) {
        stopListening();
    } else {
        startListening();
    }
});

DOM.settingsBtn.addEventListener('click', (event) => {
    DOM.settingsPanel.classList.toggle('hidden');
});

DOM.themeToggleBtn.addEventListener('click', () => {
    toggleTheme();
});

// Close settings panel when clicking outside
document.addEventListener('click', (event) => {
    if (!DOM.settingsPanel.contains(event.target) && !DOM.settingsBtn.contains(event.target)) {
        if (!DOM.settingsPanel.classList.contains('hidden')) {
            DOM.settingsPanel.classList.add('hidden');
        }
    }
});
