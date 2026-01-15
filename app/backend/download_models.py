from faster_whisper import WhisperModel
import os

# backend/download_models.py -> backend -> app -> models
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(BACKEND_DIR)
MODELS_DIR = os.path.join(APP_DIR, "models")

def download_models():
    models = ["small", "medium", "large-v3"]
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    for model_size in models:
        print(f"Checking/Downloading {model_size} model to {MODELS_DIR}...")
        try:
            WhisperModel(
                model_size, 
                device="cpu", 
                compute_type="int8",
                download_root=MODELS_DIR,
                local_files_only=False
            )
            print(f"Successfully downloaded {model_size} model.")
        except Exception as e:
            print(f"Failed to download {model_size} model: {e}")

if __name__ == "__main__":
    download_models()
