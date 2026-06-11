
export const initAudioContext = (): AudioContext => {
  const audioContext = new AudioContext();
  return audioContext;
};

export const decodeAudioFile = async (audioContext: AudioContext, file: File): Promise<AudioBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const audioBuffer = await audioContext.decodeAudioData(reader.result as ArrayBuffer);
        resolve(audioBuffer);
      } catch (error) {
        reject(new Error("Error decoding audio data. Please ensure it's a valid audio file."));
      }
    };
    reader.onerror = () => {
      reject(new Error("Error reading file."));
    };
    reader.readAsArrayBuffer(file);
  });
};

export const playAudioSegment = (
  audioContext: AudioContext,
  audioBuffer: AudioBuffer,
  startOffset: number,
  duration: number,
  destination: AudioNode,
  playbackRate: number = 1.0,
  detune: number = 0,
): AudioBufferSourceNode => {
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = playbackRate;
  source.detune.value = detune;
  source.connect(destination);
  source.start(0, startOffset, duration);
  return source;
};

export interface MutronNodes {
  input: GainNode;
  output: BiquadFilterNode;
  filter: BiquadFilterNode;
  sensitivity: GainNode;
  depth: GainNode;
}

export const createMutron = (ctx: AudioContext): MutronNodes => {
  const input = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 200; 
  filter.Q.value = 5;

  // Envelope Follower Path
  const sensitivity = ctx.createGain();
  const rectifier = ctx.createWaveShaper();
  const curve = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) {
    const x = (i / 65536) * 2 - 1;
    curve[i] = Math.abs(x);
  }
  rectifier.curve = curve;

  const smoother = ctx.createBiquadFilter();
  smoother.type = 'lowpass';
  smoother.frequency.value = 10; 

  const depth = ctx.createGain();

  // Connections
  input.connect(filter); 
  input.connect(sensitivity); 
  sensitivity.connect(rectifier);
  rectifier.connect(smoother);
  smoother.connect(depth);
  depth.connect(filter.frequency); 

  return { input, output: filter, filter, sensitivity, depth };
};

export interface LFOFilterNodes {
  input: GainNode;
  output: BiquadFilterNode;
  filter: BiquadFilterNode;
  lfo: OscillatorNode;
  depth: GainNode;
}

export const createLFOFilter = (ctx: AudioContext): LFOFilterNodes => {
  const input = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1000;
  filter.Q.value = 5;

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 1; 

  const depth = ctx.createGain();
  depth.gain.value = 500;

  input.connect(filter);
  lfo.connect(depth);
  depth.connect(filter.frequency);
  lfo.start();

  return { input, output: filter, filter, lfo, depth };
};

export const sliceAudioBuffer = (
  audioContext: AudioContext,
  audioBuffer: AudioBuffer,
  start: number,
  end: number
): AudioBuffer => {
  const duration = end - start;
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = Math.floor(duration * sampleRate);
  const slicedBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    frameCount,
    sampleRate
  );

  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    const channelData = audioBuffer.getChannelData(i);
    const slicedData = slicedBuffer.getChannelData(i);
    const startOffset = Math.floor(start * sampleRate);
    slicedData.set(channelData.subarray(startOffset, startOffset + frameCount));
  }
  return slicedBuffer;
};

// Simple WAV encoder
export const bufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded)
  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7fff) | 0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out], { type: "audio/wav" });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};
