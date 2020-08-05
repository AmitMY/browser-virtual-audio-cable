// Execute script as document
function execScript(main: Function, args: any[] = []) {
    const s = document.createElement('script');
    s.textContent = `(${main})(${args.join(',')})`;
    document.documentElement.appendChild(s);
    s.remove();
}

// Listen to messages fromm the dispatcher
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    execScript(function (msg: any) {
        (window as any).vac.onMessage(msg)
    }, [JSON.stringify(msg)]);
});
