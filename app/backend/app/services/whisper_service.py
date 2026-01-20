import os
import time
import torch
import torchaudio
import numpy as np
import shutil
import pathlib
import yaml
import huggingface_hub
from pyannote.core import Segment
import sys
import types

# ==========================================
# DEEP MONKEY PATCHING for Torchaudio 2.1+ / Pyannote Compatibility
# ==========================================

# 1. Patch missing 'torchaudio.backend' module
if "torchaudio.backend" not in sys.modules:
    # Create dummy module structure
    ta_backend = types.ModuleType("torchaudio.backend")
    ta_backend_common = types.ModuleType("torchaudio.backend.common")
    sys.modules["torchaudio.backend"] = ta_backend
    sys.modules["torchaudio.backend.common"] = ta_backend_common
    
    # Define AudioMetaData stub
    class AudioMetaData:
        def __init__(self, sample_rate, num_frames, num_channels, bits_per_sample, encoding):
            self.sample_rate = sample_rate
            self.num_frames = num_frames
            self.num_channels = num_channels
            self.bits_per_sample = bits_per_sample
            self.encoding = encoding

    ta_backend_common.AudioMetaData = AudioMetaData
    setattr(ta_backend, "common", ta_backend_common)

# 2. Patch removed functions in torchaudio
if not hasattr(torchaudio, "set_audio_backend"):
    torchaudio.set_audio_backend = lambda x: None
if not hasattr(torchaudio, "get_audio_backend"):
    torchaudio.get_audio_backend = lambda: None
if not hasattr(torchaudio, "list_audio_backends"):
    torchaudio.list_audio_backends = lambda: []

# 3. Handle torchcodec missing issue in newer torchaudio
# We want to disable torchcodec because it requires specific FFmpeg DLLs
# and is currently unstable in this environment.
try:
    # 1. Deeply disable torchcodec by masking the module
    sys.modules['torchcodec'] = None
    sys.modules['torchcodec.decoders'] = None
    
    # 2. Disable the dispatcher in torchaudio
    if hasattr(torchaudio, "_backend") and hasattr(torchaudio._backend, "_torchcodec"):
         torchaudio._backend._torchcodec = None

    import torchaudio._torchcodec
    # 3. Monkey patch load_with_torchcodec to always fail with a specific error
    # that torchaudio.load() will definitely catch and fallback.
    def disabled_load_with_torchcodec(*args, **kwargs):
        raise ImportError("torchcodec is disabled")
    torchaudio._torchcodec.load_with_torchcodec = disabled_load_with_torchcodec
    
    # 4. Also patch the module level if needed
    sys.modules['torchaudio._torchcodec'].load_with_torchcodec = disabled_load_with_torchcodec
except (ImportError, AttributeError):
    pass

# Patch torchaudio.load itself to avoid torchcodec if it still persists
# Newer torchaudio (2.x) may have a dispatcher that ignores set_audio_backend.
# We explicitly force soundfile if available.
import importlib.util

HAS_SOUNDFILE = importlib.util.find_spec("soundfile") is not None

# Critical: Some torchaudio versions have a hardcoded list of backends
# We try to remove torchcodec from it if it exists.
try:
    from torchaudio import _backend
    if hasattr(_backend, "_backends"):
        if "torchcodec" in _backend._backends:
            del _backend._backends["torchcodec"]
except:
    pass

original_torchaudio_load = torchaudio.load
def safe_torchaudio_load(uri, format=None, **kwargs):
    # If backend is specified as 'torchcodec', remove it or change it
    if kwargs.get('backend') == 'torchcodec':
        kwargs.pop('backend')
    
    # Newer torchaudio uses 'decoder' instead of 'backend' for some calls
    if 'decoder' in kwargs and kwargs['decoder'] == 'torchcodec':
        kwargs.pop('decoder')

    # Force soundfile backend if available on Windows to avoid torchcodec/ffmpeg issues
    if HAS_SOUNDFILE and 'backend' not in kwargs:
         kwargs['backend'] = 'soundfile'

    try:
        # In newer torchaudio, if load_with_torchcodec is called by dispatcher,
        # it might ignore our monkeypatch if it was already bound.
        # So we try a very direct approach.
        return original_torchaudio_load(uri, format=format, **kwargs)
    except Exception as e:
        # If it still fails or soundfile failed, try without backend spec
        if 'backend' in kwargs:
            kwargs.pop('backend')
            try:
                return original_torchaudio_load(uri, format=format, **kwargs)
            except:
                pass
        
        if "torchcodec" in str(e):
             # Final fallback: if soundfile is available, use it directly
             if HAS_SOUNDFILE:
                 import soundfile
                 data, samplerate = soundfile.read(uri)
                 return torch.from_numpy(data).t(), samplerate

        raise e

torchaudio.load = safe_torchaudio_load

# Force 'soundfile' or other backends if possible, though newer torchaudio
# manages this through dispatcher.
try:
    if hasattr(torchaudio, "set_audio_backend"):
        # Soundfile is usually most reliable on Windows if available
        torchaudio.set_audio_backend("soundfile")
except:
    pass

# 4. Patch torch.load for PyTorch 2.6+ compatibility (weights_only=True default)
# Pyannote models often require pickling which is blocked by default in newer Torch
try:
    original_torch_load = torch.load
    def safe_torch_load(*args, **kwargs):
        # Force weights_only=False to allow legacy models even if library requests True
        # This is necessary because some libraries might set it to True but the model file is not compatible
        kwargs['weights_only'] = False
        return original_torch_load(*args, **kwargs)
    torch.load = safe_torch_load
except Exception as e:
    logger.warning(f"Failed to patch torch.load: {e}")

# Monkey patch for NumPy 2.0 compatibility with older libraries
if not hasattr(np, "NaN"):
    np.NaN = np.nan
if not hasattr(np, "NAN"):
    np.NAN = np.nan

from faster_whisper import WhisperModel
try:
    from pyannote.audio import Pipeline
except Exception as e:
    print(f"Warning: Failed to import pyannote.audio: {e}")
    Pipeline = None

from app.core.config import settings
import logging
import ctypes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==========================================
# Patching for Offline Pyannote
# ==========================================
original_hf_download = huggingface_hub.hf_hub_download
assets_dir = os.path.join(settings.MODELS_DIR, "pyannote")

def offline_hf_download(repo_id, filename, **kwargs):
    if "use_auth_token" in kwargs:
        token_val = kwargs.pop("use_auth_token")
        if "token" not in kwargs and token_val is not None:
            kwargs["token"] = token_val

    # 1. Simple check: file exists directly in assets_dir
    basename = os.path.basename(filename)
    local_path = os.path.join(assets_dir, basename)
    if os.path.exists(local_path):
        return local_path
    
    direct_path = os.path.join(assets_dir, filename)
    if os.path.exists(direct_path):
        return direct_path

    # 2. HF Cache structure check (models--namespace--repo)
    # Convert repo_id to folder name format: namespace/repo -> models--namespace--repo
    cache_folder_name = "models--" + repo_id.replace("/", "--")
    cache_dir = os.path.join(assets_dir, cache_folder_name)
    
    if os.path.exists(cache_dir):
        # Look into snapshots
        snapshots_dir = os.path.join(cache_dir, "snapshots")
        if os.path.exists(snapshots_dir):
            snapshots = os.listdir(snapshots_dir)
            if snapshots:
                # Use the first snapshot (usually the hash)
                snapshot_path = os.path.join(snapshots_dir, snapshots[0])
                target_file = os.path.join(snapshot_path, filename)
                if os.path.exists(target_file):
                    return target_file

    # 3. Fallback to original download (but restrict to local files if intended)
    kwargs['local_files_only'] = True
    try:
        return original_hf_download(repo_id, filename, **kwargs)
    except Exception:
        raise ValueError(f"Offline mode: {filename} not found in {assets_dir} (repo: {repo_id}) or HF cache.")

huggingface_hub.hf_hub_download = offline_hf_download

original_symlink = pathlib.Path.symlink_to

def safe_symlink(self, target, target_is_directory=False):
    try:
        original_symlink(self, target, target_is_directory)
    except OSError:
        # Windows often fails symlinks without admin rights. Copy instead.
        if os.path.isdir(target):
            if os.path.exists(self): shutil.rmtree(self)
            shutil.copytree(target, self)
        else:
            if os.path.exists(self): os.remove(self)
            shutil.copy2(target, self)

pathlib.Path.symlink_to = safe_symlink
os.environ['HUGGINGFACE_HUB_CACHE'] = assets_dir


class WhisperService:
    def __init__(self):
        self.model_size = settings.WHISPER_MODEL_SIZE
        self.device = settings.DEVICE
        self.compute_type = settings.COMPUTE_TYPE
        self.model = None
        self.diarization_pipeline = None

    def _get_system_memory_gb(self):
        try:
            kernel32 = ctypes.windll.kernel32
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]
            
            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
            return stat.ullTotalPhys / (1024**3)
        except Exception as e:
            logger.warning(f"Failed to get system memory: {e}")
            return 8.0 # Fallback assumption

    def _adjust_model_for_cpu(self, requested_model):
        mem_gb = self._get_system_memory_gb()
        logger.info(f"System Memory: {mem_gb:.2f} GB")
        
        # Rank models: tiny=1, base=2, small=3, medium=4, large=5
        models_rank = {"tiny": 1, "base": 2, "small": 3, "medium": 4, "large": 5}
        
        # Normalize requested model name for ranking
        req_base = requested_model.split(".")[0]
        if "large" in req_base: req_base = "large"
        current_rank = models_rank.get(req_base, 5)

        # Determine max allowed model
        if mem_gb >= 16:
            max_model = "medium"
        elif mem_gb >= 8:
            max_model = "small"
        else:
            max_model = "base"
        
        max_rank = models_rank.get(max_model, 3)

        if current_rank > max_rank:
            logger.warning(f"Model '{requested_model}' is too heavy for CPU with {mem_gb:.1f}GB RAM. Downgrading to '{max_model}'.")
            return max_model
        
        return requested_model

    def load_model(self, model_size=None):
        requested_model = model_size or self.model_size
        
        # Pre-check for CPU mode (if configured as default)
        if self.device == "cpu":
            requested_model = self._adjust_model_for_cpu(requested_model)

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
                    
                    requested_model = self._adjust_model_for_cpu(requested_model)

                    self.model = WhisperModel(
                        requested_model,
                        device=self.device,
                        compute_type=self.compute_type,
                        download_root=settings.MODELS_DIR
                    )
                    self._current_loaded_model = requested_model

    def load_diarization_model(self):
        if self.diarization_pipeline:
            return

        logger.info("Loading Pyannote pipeline (Offline Mode)...")
        
        config_path = os.path.join(assets_dir, "config.yaml")
        temp_config = os.path.join(assets_dir, "config_offline_temp.yaml")
        
        if not os.path.exists(config_path):
            logger.error(f"Diarization config not found at {config_path}")
            return

        print("Preparing config...")
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config_data = yaml.safe_load(f)

            # 1. Absolute path for model
            if 'pipeline' in config_data and 'params' in config_data['pipeline']:
                # The segmentation model file is typically pytorch_model.bin in the same dir
                model_path = os.path.join(assets_dir, "pytorch_model.bin")
                model_path = model_path.replace("\\", "/")
                config_data['pipeline']['params']['segmentation'] = model_path
                
            # 2. Remove 'params' section to avoid instantiation errors
            if 'params' in config_data:
                print("Force cleaning: Removing 'params' section from config.")
                del config_data['params']

            # 3. Double check segmentation key
            if 'params' in config_data and 'segmentation' in config_data['params']:
                if isinstance(config_data['params']['segmentation'], str):
                     del config_data['params']['segmentation']

            with open(temp_config, 'w', encoding='utf-8') as f:
                yaml.dump(config_data, f)

        except Exception as e:
            logger.error(f"Config setup error: {e}")
            return

        try:
            # Load pipeline from temp config (uninitialized)
            self.diarization_pipeline = Pipeline.from_pretrained(temp_config)
            
            # --- Manual Parameter Injection ---
            print("Instantiating pipeline with manual parameters...")
            
            # Standard params
            params_standard = {
                "clustering": {
                    "method": "centroid",
                    "min_cluster_size": 12,
                    "threshold": 0.70,
                },
                "segmentation": {
                    "min_duration_off": 0.0,
                }
            }
            
            try:
                self.diarization_pipeline.instantiate(params_standard)
                print("-> Standard parameters applied successfully.")
            except ValueError as e:
                print(f"-> Standard params failed ({e}). Trying fallback...")
                params_fallback = {
                    "clustering": {
                        "method": "centroid",
                        "min_cluster_size": 12,
                    },
                    "segmentation": {
                        "min_duration_off": 0.0,
                    }
                }
                self.diarization_pipeline.instantiate(params_fallback)
                print("-> Fallback parameters applied successfully.")
            
            if torch.cuda.is_available() and self.device == "cuda":
                self.diarization_pipeline.to(torch.device("cuda"))
            
            logger.info("Diarization pipeline loaded successfully.")

        except Exception as e:
            logger.error(f"Error loading/instantiating pipeline: {e}")
            import traceback
            traceback.print_exc()
            self.diarization_pipeline = None
        finally:
            if os.path.exists(temp_config):
                try: os.remove(temp_config)
                except: pass

    def run_diarization(self, file_path: str):
        self.load_diarization_model()
        if not self.diarization_pipeline:
            return []
        
        try:
            # Some versions of torchaudio 2.x have issues with certain backends on Windows
            # or require torchcodec. We try to load waveform manually to catch errors early.
            try:
                waveform, sample_rate = torchaudio.load(file_path)
                
                # Ensure waveform is float32 to avoid "mixed dtype" error in newer PyTorch
                if waveform.dtype != torch.float32:
                    waveform = waveform.to(torch.float32)

                diarization = self.diarization_pipeline({"waveform": waveform, "sample_rate": sample_rate})
            except Exception as e:
                logger.warning(f"Manual waveform load failed: {e}. Falling back to direct path.")
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
            import traceback
            traceback.print_exc()
            return []

    def assign_speakers(self, segments, speaker_turns):
        for segment in segments:
            seg_start = segment["start"]
            seg_end = segment["end"]
            
            # Use Pyannote Segment for easier overlap calculation
            t_segment = Segment(seg_start, seg_end)
            
            # Simple greedy matching: find the speaker with max overlap
            best_speaker = "Unknown"
            max_overlap = 0
            
            for turn in speaker_turns:
                turn_start = turn["start"]
                turn_end = turn["end"]
                speaker = turn["speaker"]
                
                # Intersection
                overlap_start = max(seg_start, turn_start)
                overlap_end = min(seg_end, turn_end)
                overlap_duration = max(0, overlap_end - overlap_start)
                
                if overlap_duration > max_overlap:
                    max_overlap = overlap_duration
                    best_speaker = speaker
            
            segment["speaker"] = best_speaker
        return segments

    def transcribe_file(self, file_path: str, language: str = "ja", enable_diarization: bool = False):
        self.load_model()
        
        segments, info = self.model.transcribe(
            file_path, 
            language=language,
            beam_size=5,
            vad_filter=False # Disable VAD to allow music/lyrics transcription
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
            vad_filter=False # Disable VAD to allow music/lyrics transcription
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
        start_time = time.time()
        data_len = len(audio_data)
        logger.info(f"START transcribe_audio_data: len={data_len}, device={self.device}")

        self.load_model(model_size=model_size)
        
        # Optimize for CPU: Trade accuracy for speed to prevent blocking
        actual_beam_size = beam_size
        use_vad = True
        vad_params = dict(min_silence_duration_ms=1000)

        if self.device == "cpu":
            # Force greedy search (much faster) and disable internal VAD (saves CPU)
            actual_beam_size = 1
            use_vad = False
            vad_params = None
        
        try:
            segments, info = self.model.transcribe(
                audio_data, 
                language=language, 
                beam_size=actual_beam_size,
                vad_filter=use_vad,
                vad_parameters=vad_params,
                initial_prompt=initial_prompt
            )
            
            result_text = ""
            for segment in segments:
                result_text += segment.text
            
            elapsed = time.time() - start_time
            logger.info(f"END transcribe_audio_data: time={elapsed:.3f}s, text='{result_text[:50]}...', beam={actual_beam_size}")
            return result_text
        except Exception as e:
            logger.error(f"ERROR in transcribe_audio_data: {e}")
            raise e

whisper_service = WhisperService()
