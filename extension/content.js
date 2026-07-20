// content.js
console.log("News Collector: Content script loaded.");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("News Collector: Received message", message);
    if (message.type === 'scrape') {
        const data = {
            url: window.location.href,
            title: document.title,
            content: extractContent()
        };
        console.log("News Collector: Scraped data", data);
        sendResponse(data);
    }
    return true;
});

function extractContent() {
    // Try to find the main content area
    const selectors = [
        'article',
        '[role="main"]',
        '.main-content',
        '.article-body',
        '.post-content',
        'main',
        'body'
    ];

    let contentElement = null;
    for (const selector of selectors) {
        contentElement = document.querySelector(selector);
        if (contentElement && contentElement.innerText.trim().length > 200) {
            break;
        }
    }

    if (!contentElement) contentElement = document.body;
    
    // Remove scripts, styles, and other noise
    const clone = contentElement.cloneNode(true);
    const toRemove = clone.querySelectorAll('script, style, nav, footer, header, iframe, noscript, .ads, .comments, .sidebar');
    toRemove.forEach(el => el.remove());
    
    const text = clone.innerText.trim();
    console.log(`News Collector: Extracted ${text.length} characters of content.`);
    return text;
}
