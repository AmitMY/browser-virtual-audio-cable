# Browser Virtual Audio Cable

This extension allows you from any page to control the microphone audio stream of all other pages in the browser.

By default, all pages act as receivers, that can receive audio and add it to the user's microphone in real time.
See [examples/receiver.html](examples/receiver.html) to understand how to use this stream for other purposes.

Any page can register to be a transmitter by calling `window.vac.start()`. See [examples/transmitter.html](examples/transmitter.html).
To transmit any specific audio `MediaStream` connect that stream to `window.vac.source`.


## How does this work?
Once a transmitter is set, it opens a `WebRTC` peer connection with every other page in the browser.
To control the `WebRTC` handshake, the extension acts as a message relaying server.

The transmitter than sends a single audio stream, which is the result of all streams the transmitter connects to.
