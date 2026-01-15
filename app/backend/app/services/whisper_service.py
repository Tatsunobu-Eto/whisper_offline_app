import os
import torch
import torchaudio
import numpy as np

# Monkey patch for torchaudio > 2.0 compatibility with older pyannote.audio
if not hasattr(torchaudio, "set_audio_backend"):
    torchaudio.set_audio_backend = lambda x: None

# Monkey patch for NumPy 2.0 compatibility with older libraries
if not hasattr(np, "NaN"):
    np.NaN = np.nan

from faster_whisper import WhisperModel
try:
    from pyannote.audio import Pipeline
except Exception as e:
    print(f"Warning: Failed to import pyannote.audio: {e}")
    Pipeline = None

from app.core.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WhisperService:
    def __init__(self):
        self.model_size = settings.WHISPER_MODEL_SIZE
        self.device = settings.DEVICE
        self.compute_type = settings.COMPUTE_TYPE
        self.model = None
        self.diarization_pipeline = None

    def load_model(self, model_size=None):
        requested_model = model_size or self.model_size
        
        # Reload only if requested model is different or not loaded
        if not self.model or requested_model != getattr(self, "_current_loaded_model", None):
            # Clean up memory before loading new model
            if self.device == "cuda" and torch.cuda.is_available():
                torch.cuda.empty_cache()

            logger.info(f"Loading Whisper model: {requested_model} on {self.device}...")
            try:
                self.model = WhisperModel(
                    requested_model, 
                    device=self.device, 
                    compute_type=self.compute_type,
                    download_root=settings.MODELS_DIR,
                    local_files_only=False
                )
                self._current_loaded_model = requested_model
                logger.info(f"Whisper Model {requested_model} loaded successfully.")
            except Exception as e:
                logger.error(f"Error loading Whisper model: {e}")
                # Fallback to CPU if CUDA fails
                if self.device == "cuda":
                    logger.warning("Falling back to CPU...")
                    self.device = "cpu"
                    self.compute_type = "int8"
                    self.model = WhisperModel(
                        requested_model,
                        device=self.device,
                        compute_type=self.compute_type,
                        download_root=settings.MODELS_DIR
                    )
                    self._current_loaded_model = requested_model

    def load_diarization_model(self):
        if not self.diarization_pipeline:
            logger.info("Loading Diarization pipeline...")
            try:
                diarization_path = os.path.join(settings.MODELS_DIR, "diarization", "config.yaml")
                
                if os.path.exists(diarization_path):
                     self.diarization_pipeline = Pipeline.from_pretrained(diarization_path)
                else:
                    logger.warning(f"Diarization config not found at {diarization_path}. Trying HF default...")
                    # Update: use_auth_token is deprecated, use token instead
                    self.diarization_pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", token=os.environ.get("HF_TOKEN"))
                
                if self.diarization_pipeline:
                    if torch.cuda.is_available() and self.device == "cuda":
                        self.diarization_pipeline.to(torch.device("cuda"))
                    logger.info("Diarization pipeline loaded.")
            except Exception as e:
                logger.error(f"Failed to load diarization pipeline: {e}")
                self.diarization_pipeline = None

    def run_diarization(self, file_path: str):
        self.load_diarization_model()
        if not self.diarization_pipeline:
            return []
        
        try:
            diarization = self.diarization_pipeline(file_path)
            speakers = []
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                speakers.append({
                    "start": turn.start,
                    "end": turn.end,
                    "speaker": speaker
                })
            return speakers
        except Exception as e:
            logger.error(f"Error during diarization: {e}")
            return []

    def assign_speakers(self, segments, speaker_turns):
        for segment in segments:
            seg_start = segment["start"]
            seg_end = segment["end"]
            
            best_speaker = "Unknown"
            max_overlap = 0
            
            for turn in speaker_turns:
                turn_start = turn["start"]
                turn_end = turn["end"]
                
                overlap_start = max(seg_start, turn_start)
                overlap_end = min(seg_end, turn_end)
                overlap_duration = max(0, overlap_end - overlap_start)
                
                if overlap_duration > max_overlap:
                    max_overlap = overlap_duration
                    best_speaker = turn["speaker"]
            
            segment["speaker"] = best_speaker
        return segments

    def transcribe_file(self, file_path: str, language: str = "ja", enable_diarization: bool = False):
        self.load_model()
        
        segments, info = self.model.transcribe(
            file_path, 
            language=language,
            beam_size=5,
            vad_filter=True
        )
        
        result_segments = []
        full_text = ""
        
        for segment in segments:
            result_segments.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "confidence": segment.avg_logprob
            })
            full_text += segment.text
            
        return {
            "segments": result_segments,
            "text": full_text,
            "language": info.language,
            "duration": info.duration
        }

    def transcribe_file_generator(self, file_path: str, language: str = "ja", model_size: str = None, enable_diarization: bool = False):
        self.load_model(model_size=model_size)
        
        segments, info = self.model.transcribe(
            file_path, 
            language=language, 
            beam_size=5,
            vad_filter=True
        )
        
        total_duration = info.duration
        yield {
            "type": "info",
            "language": info.language,
            "duration": total_duration
        }
        
        result_segments = []
        
        # Stream segments as they are processed
        for segment in segments:
            seg_data = {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "confidence": segment.avg_logprob,
                "speaker": "Unknown"
            }
            
            if enable_diarization:
                result_segments.append(seg_data)
            else:
                # If not waiting for internal diarization, yield immediately
                progress = min(100, round((segment.end / total_duration) * 100)) if total_duration > 0 else 0
                yield {
                    "type": "segment",
                    **seg_data,
                    "progress": progress
                }

        if enable_diarization:
            logger.info("Performing diarization...")
            speaker_turns = self.run_diarization(file_path)
            if speaker_turns:
                result_segments = self.assign_speakers(result_segments, speaker_turns)
            logger.info("Diarization completed.")

            for segment in result_segments:
                progress = min(100, round((segment["end"] / total_duration) * 100)) if total_duration > 0 else 0
                yield {
                    "type": "segment",
                    **segment,
                    "progress": progress
                }

    def transcribe_audio_data(self, audio_data, language: str = "ja", beam_size: int = 5, initial_prompt: str = None, model_size: str = None):
        self.load_model(model_size=model_size)
        
        segments, info = self.model.transcribe(
            audio_data, 
            language=language, 
            beam_size=beam_size,
            vad_filter=True,
            initial_prompt=initial_prompt
        )
        
        result_text = ""
        for segment in segments:
            result_text += segment.text
            
        return result_text

whisper_service = WhisperService()
