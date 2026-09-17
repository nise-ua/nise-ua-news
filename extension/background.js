importScripts('collect.js');

console.log('News Collector: Service worker loaded');

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'collectNewsContext',
        title: 'Collect News from this page',
        contexts: ['page']
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'collectNewsContext') return;
    const response = await collectTab(tab);
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: response.status === 'ok' ? 'News Collector' : 'News Collector Error',
        message: response.status === 'ok' ? 'Successfully collected!' : (response.message || 'Unknown error')
    });
});
