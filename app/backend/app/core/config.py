import os
from pydantic_settings import BaseSettings

# backend/app/core/config.py -> backend/app/core -> backend/app -> backend -> ROOT
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROOT_DIR = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
MODELS_DIR = os.path.join(ROOT_DIR, "models")
DB_PATH = os.path.join(DATA_DIR, "stt.db")

# Detect Device
try:
    import torch
    HAS_TORCH_CUDA = torch.cuda.is_available()
except ImportError:
    HAS_TORCH_CUDA = False

try:
    import ctranslate2
    # Check if CTranslate2 can see the GPU (relies on correct DLLs in PATH)
    HAS_CTRANSLATE2_CUDA = ctranslate2.get_cuda_device_count() > 0
except ImportError:
    HAS_CTRANSLATE2_CUDA = False

# Faster-Whisper (ctranslate2) is the main heavy lifter, so we prioritize its CUDA detection.
# Even if torch is CPU-only, we can run Whisper on GPU if ctranslate2 supports it.
HAS_CUDA = HAS_TORCH_CUDA or HAS_CTRANSLATE2_CUDA

DEFAULT_DEVICE = "cuda" if HAS_CUDA else "cpu"
DEFAULT_COMPUTE = "float16" if HAS_CUDA else "int8"

class Settings(BaseSettings):
    PROJECT_NAME: str = "Offline STT System"
    API_V1_STR: str = "/api/v1"
    
    # Base Paths
    BASE_DIR: str = BASE_DIR
    ROOT_DIR: str = ROOT_DIR
    DATA_DIR: str = DATA_DIR
    MODELS_DIR: str = MODELS_DIR
    
    # Uploads
    UPLOAD_DIR: str = os.path.join(DATA_DIR, "uploads")
    RESULTS_DIR: str = os.path.join(DATA_DIR, "results")
    
    # Database
    DATABASE_URL: str = f"sqlite:///{DB_PATH}"
    
    # JWT
    SECRET_KEY: str = "CHANGE_THIS_IN_PRODUCTION_SECRET_KEY"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Model Settings
    WHISPER_MODEL_SIZE: str = "large-v3" # Changed to large-v3 for max accuracy (GPU required)
    DEVICE: str = DEFAULT_DEVICE
    COMPUTE_TYPE: str = DEFAULT_COMPUTE
    
    # Concurrency
    MAX_CONCURRENT_SESSIONS: int = 3
    
    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.RESULTS_DIR, exist_ok=True)
os.makedirs(settings.MODELS_DIR, exist_ok=True)
