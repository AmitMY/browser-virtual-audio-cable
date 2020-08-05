chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    console.log('GOT MESSAGE', request);

    if (!sender.tab) {
        console.error('Message sender is not a tab');
    }
    const senderTabId = (sender.tab as chrome.tabs.Tab).id;

    // Distribute message to all tabs
    chrome.tabs.query({}, (tabs) => {
        const to = request.to;
        const message = {...request, to: undefined, from: senderTabId};

        for (const tab of tabs) {
            const tabId = tab.id as number;
            if (senderTabId !== tabId // Don't send to same tab...
                && (!to || to === tabId)) { // Send to a specific tab, or all tabs
                chrome.tabs.sendMessage(tabId, message)
            }
        }
    });
    sendResponse({success: true});
    return true;
});
