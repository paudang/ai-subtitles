import { DOM } from './dom.js';
import { MAX_HISTORY_NODES, ABBREVIATIONS } from './constants.js';
import { formatSentences } from './utils.js';

let liveWords = []; // Cache of currently rendered words for strict append

export function updateStatus(state, text) {
    DOM.statusIndicator.className = '';
    if (state) DOM.statusIndicator.classList.add(`status-${state}`);
    DOM.statusText.innerText = text;
}

// Strict Append Algorithm
// Guarantees zero jitter by NEVER modifying or replacing existing DOM nodes.
export function updateLiveBoxStrictAppend(newRawText) {
    if (!newRawText) return;
    const newWords = newRawText.trim().split(/\s+/).filter(w => w.length > 0);
    
    if (newWords.length <= liveWords.length) return;
    
    for (let i = liveWords.length; i < newWords.length; i++) {
        let isFirst = (i === 0);
        let isNewSentence = false;
        
        if (i > 0) {
            let prevWord = newWords[i-1];
            let thisWord = newWords[i];
            if (/[.!?]$/.test(prevWord) && /^\p{Lu}/u.test(thisWord)) {
                let wordNoPunc = prevWord.replace(/[.!?]+$/, '').toLowerCase();
                if (!ABBREVIATIONS.includes(wordNoPunc) && !(wordNoPunc.length === 1 && prevWord.endsWith('.'))) {
                    isNewSentence = true;
                }
            }
        }
        
        if (isNewSentence) {
            DOM.currentEn.appendChild(document.createElement('br'));
            isFirst = true;
        }
        
        if (!isFirst) {
            DOM.currentEn.appendChild(document.createTextNode(" "));
        }
        
        let span = document.createElement('span');
        span.textContent = newWords[i];
        span.className = 'word-appear'; 
        DOM.currentEn.appendChild(span);
        
        liveWords.push(newWords[i]);
    }
}

export function pushToHistory(enText, viText) {
    const formattedEn = formatSentences(enText);
    const formattedVi = formatSentences(viText);
    
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item fade-up';
    historyItem.innerHTML = `
        <div class="en-text">${formattedEn}</div>
        <div class="vi-text">${formattedVi}</div>
    `;
    
    DOM.historyBox.appendChild(historyItem);
    
    while (DOM.historyBox.children.length > MAX_HISTORY_NODES) {
        DOM.historyBox.removeChild(DOM.historyBox.firstChild);
    }
    
    DOM.historyBox.scrollTo({ top: DOM.historyBox.scrollHeight, behavior: 'smooth' });
}

export function clearLiveBox() {
    DOM.currentEn.innerHTML = '';
    DOM.currentVi.innerHTML = '';
    liveWords = [];
}

export function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (theme === 'light') {
        DOM.iconMoon.style.display = 'none';
        DOM.iconSun.style.display = 'block';
    } else {
        DOM.iconMoon.style.display = 'block';
        DOM.iconSun.style.display = 'none';
    }
}
