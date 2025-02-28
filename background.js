// Background script to handle any browser-level events
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "log") {
        console.log(request.message);
    }
    return true;
}); 