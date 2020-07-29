class MicrophoneStaticProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [{
            name: 'frequency',
            defaultValue: 440,
            minValue: 0,
            maxValue: 30000
        }]
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
        const input = inputs[0];
        const output = outputs[0];
        // const frequency = parameters['frequency'][0];

        // if you just want to copy input to output:
        for (let channel = 0; channel < output.length; ++channel) {
            if (input[channel]) {
                const map1 = input[channel].map(x => -1.0 * x);
                output[channel].set(map1);
            }
        }

        // for (const channel of input) {
        //     for (let i = 0; i < channel.length; i++) {
        //         //@ts-ignore
        //         const globTime = currentTime + i / sampleRate;
        //         const time = globTime * frequency;
        //         const vibrato = Math.sin(globTime * 2 * Math.PI * 7) * 2;
        //         channel[i] = Math.sin(2 * Math.PI * time + vibrato);
        //     }
        // }

        return true;
    }
}

console.log('Registering processor');
registerProcessor('microphone-static-processor', MicrophoneStaticProcessor);
