// popup.js
console.log('News Collector: popup.js loaded');

function updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status-${type}`;
}

function sendCollectMessage() {
    if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        updateStatus('API not available. Open as extension popup.', 'error');
        return;
    }

    const btn = document.getElementById('collectNews');
    btn.disabled = true;
    updateStatus('Collecting news...', 'info');

    try {
        chrome.runtime.sendMessage({ type: 'collectNews' }, (response) => {
            btn.disabled = false;
            
            if (chrome.runtime.lastError) {
                console.error('popup.js: sendMessage failed', chrome.runtime.lastError);
                updateStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
            } else if (response && response.status === 'ok') {
                console.log('popup.js: success', response);
                updateStatus('Successfully collected!', 'ok');
            } else {
                console.error('popup.js: background error', response);
                updateStatus(response?.message || 'Unknown error occurred', 'error');
            }
        });
    } catch (err) {
        btn.disabled = false;
        console.error('popup.js: error sending message', err);
        updateStatus(err.message, 'error');
    }
}

function setupCollectButton() {
    const btn = document.getElementById('collectNews');
    if (!btn) return false;

    btn.addEventListener('click', () => {
        sendCollectMessage();
    });

    return true;
}

// Ensure DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCollectButton);
} else {
    setupCollectButton();
}
