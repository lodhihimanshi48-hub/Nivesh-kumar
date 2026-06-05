import { getMemory } from "./memory";

export async function playPCM(base64Data: string): Promise<void> {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn("AudioContext not supported");
      return;
    }
    
    // Load current voice characteristics from persistent DB config
    const memory = getMemory();
    const pitch = memory.voicePitch ?? 1.0;
    const speed = memory.voiceSpeed ?? 1.0;

    const audioCtx = new AudioContextClass({ sampleRate: 24000 });
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const buffer = new Int16Array(bytes.buffer);
    
    // Adjust buffer sample rate to manipulate pitch. 
    // Higher sampleRate on buffer -> plays back slower and lower pitch.
    // Lower sampleRate on buffer -> plays back faster and higher pitch.
    const bufferSampleRate = 24000 / pitch;
    
    const audioBuffer = audioCtx.createBuffer(1, buffer.length, bufferSampleRate);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      channelData[i] = buffer[i] / 32768.0;
    }
    
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    
    // Compound formula to separate pitch and playback speed correctly.
    // Final speed = pitch multiplier (from sample rate mismatch) * source.playbackRate
    // So final speed = pitch * (speed / pitch) = speed.
    source.playbackRate.value = speed / pitch;
    
    source.connect(audioCtx.destination);
    source.start();
    
    return new Promise<void>(resolve => {
      source.onended = () => {
        audioCtx.close().catch(err => console.error("Error closing AudioContext:", err));
        resolve();
      };
    });
  } catch (error) {
    console.error("Error playing audio with customized pitch and speed:", error);
  }
}
