declare const chrome: any;
declare const WORKLET_PATH: string;

let runningScript = '';

function declareStr(name: string, value: string) {
    runningScript += `const ${name} = "${value}";\n`
}

function declareFunc(func: Function) {
    runningScript += String(func) + '\n';
}

// Injects the entire script to that point
function injectScript() {
    const s = document.createElement('script');
    s.textContent = runningScript;
    document.documentElement.appendChild(s);
    s.remove();
}

// Execute script as document
function execScript(main: Function) {
    const s = document.createElement('script');
    s.textContent = `(${main})()`;
    document.documentElement.appendChild(s);
    s.remove();
}

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


class MicrophoneStaticNoise {
    private micStreams: MediaStream[] = [];
    private audioCtx?: AudioContext;
    private worklet?: AudioWorkletNode;

    async connectMicrophone(micStream: MediaStream): Promise<AudioNode> {
        this.log('connectMicrophone');

        this.micStreams.push(micStream);
        const audioCtx = this.audioCtx;
        while(!audioCtx || !this.worklet) {
            await wait(100);
        }

        const mic = audioCtx.createMediaStreamSource(micStream);
        return mic.connect(this.worklet as AudioWorkletNode)
    }

    async initAudio() {
        this.log('initAudio');
        this.audioCtx = new AudioContext();
        await this.audioCtx.audioWorklet.addModule(WORKLET_PATH);
        console.log("this.audioCtx", this.audioCtx);
        this.worklet = new AudioWorkletNode(this.audioCtx, 'microphone-static-processor');
        this.worklet.connect(this.audioCtx.destination);
    }

    log(...args: any[]) {
        console.log('[EXT]', ...args);
    }
}

// Declare global variables
declareStr('WORKLET_PATH', chrome.extension.getURL('dist/audio-worklet.js'));

// Declare functions
declareFunc(wait);
declareFunc(MicrophoneStaticNoise);

// Inject the script
injectScript();

// Main
execScript(function main() {
    // Instantiate mic class
    const micStatic = new MicrophoneStaticNoise();
    document.addEventListener('DOMContentLoaded', micStatic.initAudio.bind(micStatic));
    micStatic.log('Static Microphone Noise');

    // Get microphone
    const navigatorMediaDevicesGetUserMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async function (constraints) {
        let stream = await navigatorMediaDevicesGetUserMedia.call(this, constraints);
        micStatic.log('getUserMedia', {constraints, stream});
        if (!constraints || constraints.audio) {
            const mic = await micStatic.connectMicrophone(stream);
            console.log({mic});
        }
        return stream;
    };
});

