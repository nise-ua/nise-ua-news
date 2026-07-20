// background.js
console.log('News Collector: Service worker loaded');

const BACKEND_URL = 'http://localhost:3000/api/articles/batch';

chrome.runtime.onInstalled.addListener(() => {
    console.log("News Collector extension installed.");
    chrome.contextMenus.create({
        id: "collectNewsContext",
        title: "Collect News from this page",
        contexts: ["page"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "collectNewsContext") {
        collectTab(tab, (response) => {
            console.log('background.js: context menu collection result', response);
            if (response.status === 'ok') {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icon48.png',
                    title: 'News Collector',
                    message: 'Successfully collected!'
                });
            } else {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icon48.png',
                    title: 'News Collector Error',
                    message: response.message
                });
            }
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('background.js: received message', message);
    
    if (message && message.type === 'collectNews') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) {
                sendResponse({ status: 'error', message: 'No active tab found' });
                return;
            }
            collectTab(tab, (response) => {
                console.log('background.js: sending response back to popup', response);
                sendResponse(response);
            });
        });
        return true; // Keep channel open for async response
    }
});

async function collectTab(tab, onResult) {
    try {
        if (!tab) {
            onResult({ status: 'error', message: 'No tab provided' });
            return;
        }

        if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
            onResult({ status: 'error', message: 'Cannot collect news from system pages. Please open a news website.' });
            return;
        }

        console.log('background.js: requesting scrape from tab', tab.id, tab.url);
        
        // Use a promise to handle the message to the content script
        const scrapedData = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { type: 'scrape' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('background.js: sendMessage error', chrome.runtime.lastError);
                    resolve(null);
                } else {
                    resolve(response);
                }
            });
        });

        if (!scrapedData) {
            onResult({ 
                status: 'error', 
                message: 'Could not communicate with the page. Please REFRESH the page and try again. (Extension was recently updated)' 
            });
            return;
        }

        console.log(`background.js: sending to backend ${BACKEND_URL}`, scrapedData);

        const backendResponse = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: [{
                    url: scrapedData.url,
                    title: scrapedData.title,
                    content: scrapedData.content,
                    source: 'extension'
                }]
            })
        });

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text();
            throw new Error(`Backend error: ${backendResponse.status} ${errorText}`);
        }

        const result = await backendResponse.json();
        console.log('background.js: backend success', result);
        onResult({ status: 'ok', data: result });

    } catch (err) {
        console.error('background.js: collection failed', err);
        onResult({ status: 'error', message: err.message });
    }
}
