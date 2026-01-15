class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      // Buffer size for sending data to main thread (e.g. 4096 samples ≈ 256ms at 16kHz)
      // Sending too frequently can cause overhead
      this.bufferSize = 4096;
      this.buffer = new Float32Array(this.bufferSize);
      this.bytesWritten = 0;
    }
  
    process(inputs, outputs, parameters) {
      const input = inputs[0];
      if (input.length > 0) {
        const channelData = input[0];
        
        // Accumulate data
        for (let i = 0; i < channelData.length; i++) {
          this.buffer[this.bytesWritten++] = channelData[i];
          
          // When buffer is full, flush to main thread
          if (this.bytesWritten >= this.bufferSize) {
            this.port.postMessage(this.buffer);
            this.bytesWritten = 0;
          }
        }
      }
      return true;
    }
  }
  
  registerProcessor('audio-processor', AudioProcessor);
