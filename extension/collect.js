const DEFAULT_BACKEND_URL = '';
const SCRAPE_MS = 8000;
const FETCH_MS = 15000;

function normalizeBackendUrl(raw) {
    const trimmed = String(raw || '').trim().replace(/\/+$/, '');
    return trimmed || DEFAULT_BACKEND_URL;
}

function withTimeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            }
        );
    });
}

async function getCollectorSettings() {
    const stored = await chrome.storage.sync.get({
        backendUrl: DEFAULT_BACKEND_URL,
        apiSecretKey: ''
    });
    return {
        backendUrl: normalizeBackendUrl(stored.backendUrl),
        apiSecretKey: String(stored.apiSecretKey || '').trim()
    };
}

function sendTabMessage(tabId, payload) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, payload, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(response);
        });
    });
}

async function scrapeTab(tab) {
    const tryScrape = () => withTimeout(
        sendTabMessage(tab.id, { type: 'scrape' }),
        SCRAPE_MS,
        'Timed out reading the page. Refresh the tab and try again.'
    );

    try {
        const first = await tryScrape();
        if (first && first.url) return first;
    } catch {
        // inject and retry
    }

    if (chrome.scripting && chrome.scripting.executeScript) {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
        const second = await tryScrape();
        if (second && second.url) return second;
    }

    throw new Error('Could not read this page. Refresh the tab, then collect again.');
}

async function postArticle(scrapedData) {
    const { backendUrl, apiSecretKey } = await getCollectorSettings();
    if (!backendUrl) {
        throw new Error('Set the app URL in the extension popup before collecting.');
    }
    if (!apiSecretKey) {
        throw new Error('Save API_SECRET_KEY in this popup first (same key as the NAS .env).');
    }

    const batchUrl = `${backendUrl}/api/articles/batch`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_MS);

    let backendResponse;
    try {
        backendResponse = await fetch(batchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiSecretKey}`
            },
            body: JSON.stringify({
                items: [{
                    url: scrapedData.url,
                    title: scrapedData.title,
                    content: scrapedData.content,
                    source: 'extension'
                }]
            }),
            signal: controller.signal
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`No response from ${batchUrl} in ${FETCH_MS / 1000}s. Check NAS URL and that the app is running.`);
        }
        throw new Error(`Cannot reach ${batchUrl}: ${err.message}`);
    } finally {
        clearTimeout(timer);
    }

    if (!backendResponse.ok) {
        const errorText = await backendResponse.text();
        throw new Error(`Backend ${backendResponse.status}: ${errorText.slice(0, 300)}`);
    }

    return backendResponse.json();
}

async function collectTab(tab) {
    if (!tab) {
        return { status: 'error', message: 'No tab provided' };
    }
    const url = tab.url || '';
    if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('chrome-extension://')) {
        return { status: 'error', message: 'Open a news article tab, then collect.' };
    }

    try {
        const scrapedData = await scrapeTab(tab);
        const result = await postArticle(scrapedData);
        return { status: 'ok', data: result };
    } catch (err) {
        return { status: 'error', message: err.message || String(err) };
    }
}

async function getActiveNewsTab() {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = (tabs || []).find((item) => item.id && item.url && !item.url.startsWith('chrome-extension://'));
    if (tab) return tab;
    const all = await chrome.tabs.query({ active: true });
    return (all || []).find((item) => item.id && item.url && !item.url.startsWith('chrome-extension://')) || null;
}
