console.log('News Collector: popup.js loaded');

function updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-${type}`;
}

async function sendCollectMessage() {
    const btn = document.getElementById('collectNews');
    btn.disabled = true;
    updateStatus('Collecting news...', 'info');

    try {
        const tab = await getActiveNewsTab();
        if (!tab) {
            updateStatus('No news tab found. Click an article window, then collect.', 'error');
            return;
        }
        const response = await collectTab(tab);
        if (response.status === 'ok') {
            updateStatus('Successfully collected!', 'ok');
        } else {
            updateStatus(response.message || 'Unknown error occurred', 'error');
        }
    } catch (err) {
        updateStatus(err.message || String(err), 'error');
    } finally {
        btn.disabled = false;
    }
}

function loadSettings() {
    chrome.storage.sync.get({
        backendUrl: DEFAULT_BACKEND_URL,
        apiSecretKey: ''
    }, (stored) => {
        const urlEl = document.getElementById('backendUrl');
        const keyEl = document.getElementById('apiSecretKey');
        if (urlEl) urlEl.value = stored.backendUrl || DEFAULT_BACKEND_URL;
        if (keyEl) keyEl.value = stored.apiSecretKey || '';
    });
}

function saveSettings() {
    const backendUrl = document.getElementById('backendUrl').value.trim().replace(/\/+$/, '') || DEFAULT_BACKEND_URL;
    const apiSecretKey = document.getElementById('apiSecretKey').value.trim();
    chrome.storage.sync.set({ backendUrl, apiSecretKey }, () => {
        updateStatus('Destination saved. Collect will hit this UGREEN app.', 'ok');
    });
}

function setup() {
    const collectBtn = document.getElementById('collectNews');
    const saveBtn = document.getElementById('saveSettings');
    if (collectBtn) collectBtn.addEventListener('click', () => {
        sendCollectMessage();
    });
    if (saveBtn) saveBtn.addEventListener('click', saveSettings);
    loadSettings();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
} else {
    setup();
}
