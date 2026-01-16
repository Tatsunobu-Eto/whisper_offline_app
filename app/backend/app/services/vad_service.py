import torch
import numpy as np
import logging
import os
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VadService:
    def __init__(self):
        self.model = None
        self.utils = None
        self.sample_rate = 16000
    
    def load_model(self):
        if self.model is None:
            try:
                # 1. Try Local Load
                vad_path = os.path.join(settings.MODELS_DIR, "vad", "silero_vad.jit")
                if os.path.exists(vad_path):
                    logger.info(f"Loading local VAD model from {vad_path}...")
                    self.model = torch.jit.load(vad_path)
                    self.model.to(torch.device('cpu'))
                    # Utils are not strictly needed for just running the model inference
                    self.utils = None 
                    logger.info("Local Silero VAD model loaded successfully.")
                    return

                # 2. Fallback to torch.hub
                logger.info("Local VAD model not found. Trying torch.hub...")
                self.model, self.utils = torch.hub.load(
                    repo_or_dir='snakers4/silero-vad',
                    model='silero_vad',
                    force_reload=False,
                    onnx=False,
                    trust_repo=True
                )
                # Ensure model is on CPU to save GPU for Whisper
                self.model.to(torch.device('cpu'))
                logger.info("Silero VAD model loaded successfully (CPU) via Hub.")
            except Exception as e:
                logger.error(f"Failed to load Silero VAD: {e}")
                raise e

    def is_speech(self, audio_chunk: np.ndarray, threshold: float = 0.5) -> bool:
        """
        Check if the given audio chunk contains speech.
        Args:
            audio_chunk: float32 numpy array
            threshold: probability threshold (0.0 to 1.0)
        Returns:
            bool: True if speech is detected
        """
        if self.model is None:
            self.load_model()
            
        if len(audio_chunk) == 0:
            return False
        
        # Make sure array is writable and has correct layout
        audio_chunk = np.array(audio_chunk, copy=True)
            
        # Silero VAD requirements:
        # 16000 Hz -> 512 samples
        # 8000 Hz -> 256 samples
        window_size_samples = 512 if self.sample_rate == 16000 else 256
        
        speech_probs = []
        
        # Iterate over the buffer in windows
        for i in range(0, len(audio_chunk), window_size_samples):
            chunk = audio_chunk[i:i + window_size_samples]
            
            # Pad if last chunk is smaller than window size
            if len(chunk) < window_size_samples:
                chunk = np.pad(chunk, (0, window_size_samples - len(chunk)))
            
            tensor = torch.from_numpy(chunk)
            if len(tensor.shape) == 1:
                tensor = tensor.unsqueeze(0)
            
            try:
                # model(x, sr) returns probability of speech
                prob = self.model(tensor, self.sample_rate).item()
                speech_probs.append(prob)
            except Exception as e:
                logger.error(f"VAD chunk error: {e}")
                # Don't fail completely, just ignore this chunk
                continue
        
        if not speech_probs:
            return False
            
        # If any window in this chunk has speech probability > threshold, 
        # consider the whole chunk as containing speech.
        return max(speech_probs) > threshold

vad_service = VadService()
