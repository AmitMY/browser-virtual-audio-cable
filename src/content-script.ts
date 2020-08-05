// The main function is executed in the document's context

function main() {
    function log(...args: any[]) {
        // VAC log, hide for production
        console.log('[VAC]', ...args);
    }

    function messageExtension(msg: any) {
        chrome.runtime.sendMessage('pjgiimhboecnfmmjmbpefhefihpjiedf', msg)
    }

    class VACPeer {
        connection: RTCPeerConnection = new RTCPeerConnection();
        localDataChannel: RTCDataChannel = this.connection.createDataChannel('virtual-audio');
        remoteDataChannel?: RTCDataChannel;
        tracks: ReadonlyArray<MediaStream> = [];

        // To make sure the handshake follows the correct sequence, all promises should be chained
        sequencePromise = Promise.resolve();

        constructor(private tabId: string, private vac: VirtualAudioController, stream?: MediaStream) {
            // Listen to remote data channel
            this.connection.addEventListener('datachannel', e => this.remoteDataChannel = e.channel);

            // Add remote tracks
            this.connection.addEventListener('track', e => this.setTracks(e.streams));

            // Transmit stream if need be
            if (stream) {
                stream.getTracks().forEach(track => this.connection.addTrack(track, stream));
            }

            this.connect();
        }

        connect() {
            // Send ICE candidates
            this.connection.addEventListener('icecandidate', e => {
                log('icecandidate', e.candidate);

                if (e.candidate) {
                    // Send the candidate to the remote peer
                    this.sendMessage({candidate: e.candidate});
                } else {
                    // All ICE candidates have been sent
                }
            });

            // Send local description
            this.connection.addEventListener('negotiationneeded', async e => {
                log('negotiationneeded');

                const offer = await this.connection.createOffer();
                if (this.connection.signalingState !== 'have-remote-offer') { // Make sure doesn't already have remote offer
                    await this.connection.setLocalDescription(offer);
                    this.sendMessage({sdp: this.connection.localDescription})
                }
            });
        }

        async setDescription(sdp: RTCSessionDescriptionInit) {
            await this.connection.setRemoteDescription(new RTCSessionDescription(sdp));
            if (this.connection.signalingState != 'stable') {
                const answer = await this.connection.createAnswer();
                await this.connection.setLocalDescription(answer);
                this.sendMessage({sdp: this.connection.localDescription})
            }
        }

        async addCandidate(candidate: RTCIceCandidateInit) {
            await this.connection.addIceCandidate(new RTCIceCandidate(candidate))
        }

        setTracks(tracks: ReadonlyArray<MediaStream>) {
            log('setTracks', tracks);
            this.tracks = tracks;
            this.tracks.forEach(track => this.vac.addStream(track));
        }

        sendMessage(msg: any) {
            log('send', msg);
            messageExtension({...msg, to: Number(this.tabId)});
        }
    }

    class VirtualAudioController {
        peers: { [key: string]: VACPeer } = {}; // Key is tab ID

        audioCtx = new AudioContext();
        source = this.audioCtx.createMediaStreamDestination(); // Stream to optionally transmit to peers
        destination = this.audioCtx.createMediaStreamDestination(); // Stream getting from peers

        isSource = false; // Is this tab transmitting audio?

        constructor() {
            // if this class is created before page load, AudioContext is paused.
            const resumeListener = () => {
                log('Resume audioCtx');
                window.removeEventListener('click', resumeListener);
                return this.audioCtx.resume();
            };
            window.addEventListener('click', resumeListener)
        }

        addStream(stream: MediaStream) {
            const source = this.audioCtx.createMediaStreamSource(stream);
            source.connect(this.destination as MediaStreamAudioDestinationNode);
        }

        connectMicrophone(micStream: MediaStream): MediaStream {
            log('connectMicrophone', micStream);

            const destination = this.audioCtx.createMediaStreamDestination();

            // Connect microphone
            const mic = this.audioCtx.createMediaStreamSource(micStream);
            mic.connect(destination);

            // Connect virtual audio
            const vac = this.audioCtx.createMediaStreamSource((this.destination as MediaStreamAudioDestinationNode).stream);
            vac.connect(destination);

            return destination.stream;
        }

        newPeer(tabId: string) {
            log('newPeer', tabId);

            this.peers[tabId] = new VACPeer(tabId, this, this.isSource ? this.source.stream : undefined);
        }

        async onMessage(msg: any) {
            log('onMessage', msg);

            const tabId = String(msg.from);
            if (!(tabId in this.peers)) {
                this.newPeer(tabId);
            }

            const peer = this.peers[tabId] as VACPeer;

            if (msg.sdp) {
                await peer.setDescription(msg.sdp)
            }
            if (msg.candidate) {
                await peer.addCandidate(msg.candidate)
            }
        }

        // If a tab wants to transmit audio, it should call start, which establishes a connection with all other tabs
        // Calling it multiple times does not create duplicate connections
        start() {
            log('start');

            // TODO remove
            const oscillator = this.audioCtx.createOscillator();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, this.audioCtx.currentTime); // value in hertz
            oscillator.connect(this.source);
            oscillator.start();

            this.isSource = true;
            messageExtension({start: true});
        }

        // Kills all current peer connections
        stop() {
            log('stop');
            this.isSource = false;
            for (const peer of Object.values(this.peers)) {
                peer.connection.close();
            }
            this.peers = {};
        }
    }

    // Initialize Virtual Audio Controller
    const vac = new VirtualAudioController();
    (window as any).vac = vac;


    // Hijack getUserMedia streams
    const navigatorMediaDevicesGetUserMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async function (constraints) {
        let stream = await navigatorMediaDevicesGetUserMedia.call(this, constraints);
        if (!constraints || constraints.audio) {
            try {
                stream = vac.connectMicrophone(stream);
            } catch (e) {
                console.error('Failed to connect mic', e);
            }
            console.log({stream});
        }
        return stream;
    };
}

execScript(main);
