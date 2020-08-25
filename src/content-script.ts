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

        constructor(private tabId: string, private vac: VirtualAudioController) {
            this.connect();
        }

        sendTrack(stream: MediaStream) {
            stream.getTracks().forEach(track => this.connection.addTrack(track, stream));
        }

        listeners: any = {}

        connect() {
            // Listen to remote data channel
            this.listeners.datachannel = (e: any) => this.remoteDataChannel = e.channel;

            // Add remote tracks
            this.listeners.track = (e: any) => this.setTracks(e.streams);

            // Send ICE candidates
            this.listeners.icecandidate = (e: any) => {
                log('icecandidate', e.candidate);

                if (e.candidate) {
                    // Send the candidate to the remote peer
                    this.sendMessage({candidate: e.candidate});
                } else {
                    // All ICE candidates have been sent
                }
            };

            // Send local description
            this.listeners.negotiationneeded = async (e: any) => {
                log('negotiationneeded');

                const offer = await this.connection.createOffer();
                if (this.connection.signalingState !== 'have-remote-offer') { // Make sure doesn't already have remote offer
                    await this.connection.setLocalDescription(offer);
                    this.sendMessage({sdp: this.connection.localDescription})
                }
            };

            for (const [key, listener] of Object.entries(this.listeners)) {
                this.connection.addEventListener(key as any, listener as any);
            }
        }

        disconnect() {
            for (const [key, listener] of Object.entries(this.listeners)) {
                this.connection.removeEventListener(key as any, listener as any);
            }
            this.connection.close();
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

        audioCtx!: AudioContext;
        source!: MediaStreamAudioDestinationNode; // Stream to optionally transmit to peers
        destination!: MediaStreamAudioDestinationNode; // Stream getting from peers

        isSource = false; // Is this tab transmitting audio?

        initialized!: Promise<any>;

        constructor() {
            this.initialized = new Promise(resolve => {
                window.addEventListener('load', () => {
                    this.init();
                    resolve();
                });
            })
        }

        init() {
            this.audioCtx = new AudioContext();
            this.source = this.audioCtx.createMediaStreamDestination();
            this.destination = this.audioCtx.createMediaStreamDestination();
        }

        async addStream(stream: MediaStream) {
            await this.initialized;

            // Workaround to solve bug where audio is muted
            new Audio().srcObject = stream;

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

            if (tabId in this.peers) {
                log('Closing previous peer', tabId);
                this.peers[tabId].disconnect();
            }

            this.peers[tabId] = new VACPeer(tabId, this);
            if (this.isSource) {
                this.peers[tabId].sendTrack(this.source.stream);
            }
        }

        async onMessage(msg: any) {
            log('onMessage', msg);

            const tabId = String(msg.from);

            if (tabId in this.peers && 'transmitting' in msg && !msg.transmitting) {
                this.peers[tabId].disconnect();
                delete this.peers[tabId];
                return;
            }

            if (!(tabId in this.peers)) {
                this.newPeer(tabId);
            }

            const peer = this.peers[tabId] as VACPeer;

            // if(msg.transmitting) {
            //     peer.sendMessage({receiving: true});
            // }
            if (msg.sdp) {
                await peer.setDescription(msg.sdp)
            }
            if (msg.candidate) {
                await peer.addCandidate(msg.candidate)
            }
        }

        sync() {
            // Just transmit sync message to know if some process can send us audio
            messageExtension({sync: true});
        }

        // If a tab wants to transmit audio, it should call start, which establishes a connection with all other tabs
        // Calling it multiple times does not create duplicate connections
        async start() {
            await this.initialized;

            log('start');

            // TODO remove
            const oscillator = this.audioCtx.createOscillator();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, this.audioCtx.currentTime); // value in hertz
            oscillator.connect(this.source);
            oscillator.start();

            // Send track to all existing peers
            for (const peer of Object.values(this.peers)) {
                peer.sendTrack(this.source.stream);
            }

            this.isSource = true;
            messageExtension({transmitting: true});
        }

        // Kills all current peer connections
        stop() {
            log('stop');
            this.isSource = false;
            for (const peer of Object.values(this.peers)) {
                peer.disconnect();
            }
            this.peers = {};
            messageExtension({transmitting: false});
        }
    }

    const vac = new VirtualAudioController();
    (window as any).vac = vac;

    vac.sync();

    window.addEventListener('beforeunload', vac.stop.bind(vac));

    // Hijack getUserMedia streams
    const navigatorMediaDevicesGetUserMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async function (constraints) {
        let stream = await navigatorMediaDevicesGetUserMedia.call(this, constraints);
        if (!constraints || constraints.audio) {
            try {
                stream = (window as any).vac.connectMicrophone(stream);
            } catch (e) {
                console.error('Failed to connect mic', e);
            }
            console.log({stream});
        }
        return stream;
    };
}

execScript(main);
