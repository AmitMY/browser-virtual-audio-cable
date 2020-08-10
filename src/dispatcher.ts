const transmitters: Set<number> = new Set([]);

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    console.log('GOT MESSAGE', request, sender);

    if (!sender.tab) {
        console.error('Message sender is not a tab');
    }
    const senderTabId = (sender.tab as chrome.tabs.Tab).id as number;

    if ('transmitting' in request) {
        if (request.transmitting) {
            transmitters.add(senderTabId);
        } else {
            transmitters.delete(senderTabId);
        }
    }

    // Special message to sync transmitters for new page
    if ('sync' in request) {
        transmitters.forEach(from => chrome.tabs.sendMessage(senderTabId, {from, transmitting: true}));
        return;
    }

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
