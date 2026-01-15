export class AudioProcessor {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private onAudioData: (data: Float32Array) => void;
  private readonly targetSampleRate = 16000;

  constructor(onAudioData: (data: Float32Array) => void) {
    this.onAudioData = onAudioData;
  }

  async start(deviceId?: string) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Initialize AudioContext with target sample rate
      // This forces the browser to handle resampling for us
      this.context = new AudioContext({ sampleRate: this.targetSampleRate });
      
      // Load the AudioWorklet processor
      // We assume the file is served at the root (public folder in Vite)
      try {
        await this.context.audioWorklet.addModule('/audio-processor.js');
      } catch (e) {
        // Fallback for some environments or path issues? 
        // Try relative path just in case, though root usually works for public
        await this.context.audioWorklet.addModule('audio-processor.js');
      }

      this.source = this.context.createMediaStreamSource(this.stream);
      this.worklet = new AudioWorkletNode(this.context, 'audio-processor');

      this.worklet.port.onmessage = (event) => {
        // event.data is Float32Array
        this.onAudioData(event.data);
      };

      this.source.connect(this.worklet);
      this.worklet.connect(this.context.destination); // Needed in some browsers to keep the graph alive

      // If context is suspended (autoplay policy), resume it
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

    } catch (error) {
      console.error("Error accessing microphone:", error);
      throw error;
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.worklet) {
      this.worklet.disconnect();
      this.worklet = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }
}
