from fastapi import APIRouter, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from starlette.concurrency import iterate_in_threadpool
import shutil
import os
import json
import uuid
import asyncio
import numpy as np
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from app.core.config import settings
from app.services.whisper_service import whisper_service
from app.services.vad_service import vad_service
from app.db.session import SessionLocal
from app.models.session import Session as SessionModel, Transcription
from app.models.settings import AppSettings
from app.api import deps
from app.models.user import User

router = APIRouter()
# Simple thread pool for offloading blocking tasks
executor = ThreadPoolExecutor(max_workers=settings.MAX_CONCURRENT_SESSIONS)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/file")
async def transcribe_file(
    file: UploadFile = File(...),
    language: str = Form("ja"),
    model_size: str = Form(None), # Default to None to use system setting
    enable_diarization: bool = Form(False),
    current_user: User = Depends(deps.get_current_user)
):
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    # Save file
    session_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1]
    if not file_ext:
        file_ext = ".wav" # Default fallback
        
    file_path = os.path.join(settings.UPLOAD_DIR, f"{session_id}{file_ext}")
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
        
    async def generate():
        yield json.dumps({"type": "status", "session_id": session_id, "status": "processing"}) + "\n"
        
        segments_buffer = []
        full_text = ""
        duration = 0.0
        
        try:
            # Get model size from system settings if not provided
            actual_model_size = model_size
            if not actual_model_size:
                db_internal = SessionLocal()
                setting = db_internal.query(AppSettings).filter(AppSettings.id == "whisper_model_size").first()
                actual_model_size = setting.value if setting else "medium"
                db_internal.close()

            # Create generator (lazy, doesn't block yet)
            gen = whisper_service.transcribe_file_generator(file_path, language, model_size=actual_model_size)
            
            # Iterate in thread pool
            async for item in iterate_in_threadpool(gen):
                yield json.dumps(item) + "\n"
                if item["type"] == "segment":
                    segments_buffer.append(item)
                    full_text += item["text"]
                elif item["type"] == "info":
                    duration = item["duration"]
            
            # Post-processing: Diarization
            if enable_diarization:
                yield json.dumps({"type": "status", "status": "diarizing"}) + "\n"
                loop = asyncio.get_event_loop()
                speaker_turns = await loop.run_in_executor(
                    executor,
                    whisper_service.run_diarization,
                    file_path
                )
                
                # Assign speakers to segments
                if speaker_turns:
                    segments_buffer = whisper_service.assign_speakers(segments_buffer, speaker_turns)
            
            # Save to DB
            db = SessionLocal()
            try:
                # Create Session record
                db_session = SessionModel(
                    id=session_id,
                    user_id=current_user.id,
                    session_type="file",
                    status="completed",
                    audio_file_path=file_path,
                    diarization=enable_diarization,
                    meta_data={"duration": duration, "language": language},
                    created_at=datetime.utcnow(),
                    completed_at=datetime.utcnow()
                )
                db.add(db_session)
                
                # Create Transcription records
                for seg in segments_buffer:
                    db_transcription = Transcription(
                        session_id=session_id,
                        start_time=seg["start"],
                        end_time=seg["end"],
                        text=seg["text"],
                        speaker=seg.get("speaker"),
                        confidence=seg.get("confidence", 0.0)
                    )
                    db.add(db_transcription)
                
                db.commit()
            except Exception as db_e:
                print(f"DB Error: {db_e}")
                db.rollback()
            finally:
                db.close()
            
            yield json.dumps({"type": "status", "status": "completed", "result": {"segments": segments_buffer}}) + "\n"
            
        except Exception as e:
            # Update DB to error state if possible
            try:
                db = SessionLocal()
                db_session = SessionModel(
                    id=session_id,
                    status="error",
                    audio_file_path=file_path,
                    meta_data={"error": str(e)},
                    created_at=datetime.utcnow()
                )
                db.add(db_session)
                db.commit()
                db.close()
            except:
                pass
                
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")

@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Configuration
    SILENCE_TIMEOUT = 0.5 
    MAX_BUFFER_DURATION = 15.0 
    SAMPLE_RATE = 16000
    PARTIAL_UPDATE_INTERVAL = 0.5 

    # Retrieve model size setting
    db_internal = SessionLocal()
    try:
        setting = db_internal.query(AppSettings).filter(AppSettings.id == "whisper_model_size").first()
        actual_model_size = setting.value if setting else None
    except Exception as e:
        print(f"Error fetching model setting: {e}")
        actual_model_size = None
    finally:
        db_internal.close()

    # Shared State
    state = {
        "audio_buffer": np.array([], dtype=np.float32),
        "is_speaking": False,
        "silence_duration": 0.0,
        "last_partial_time": 0.0,
        "running": True,
        "last_transcript": "" # For context awareness
    }
    
    loop = asyncio.get_event_loop()

    # Background Task: Periodic Partial Transcription
    async def transcriber():
        while state["running"]:
            await asyncio.sleep(0.1) # Check interval
            
            now = datetime.utcnow().timestamp()
            # Only transcribe if speaking and interval passed
            if state["is_speaking"] and (now - state["last_partial_time"] > PARTIAL_UPDATE_INTERVAL):
                if len(state["audio_buffer"]) > 0:
                    # Snapshot (copy) to avoid race conditions
                    process_buffer = state["audio_buffer"].copy()
                    
                    try:
                        # Use last_transcript as prompt for context
                        prompt = state["last_transcript"][-200:] if state["last_transcript"] else None

                        # CPU-intensive blocking call offloaded to thread
                        # Use beam_size=1 (Greedy) for fast partial results
                        text = await loop.run_in_executor(
                            executor, 
                            whisper_service.transcribe_audio_data, 
                            process_buffer,
                            "ja",
                            1,
                            prompt,
                            actual_model_size
                        )
                        
                        # Only send if still speaking (avoid race with Final)
                        if text.strip() and state["running"] and state["is_speaking"]:
                            await websocket.send_json({
                                "type": "partial", 
                                "text": text.strip(), 
                                "timestamp": now
                            })
                            state["last_partial_time"] = now
                    except Exception as e:
                        print(f"Partial transcr error: {e}")

    transcriber_task = asyncio.create_task(transcriber())

    # Helper for Finalization
    async def finalize_utterance(buffer_snapshot):
        try:
            prompt = state["last_transcript"][-200:] if state["last_transcript"] else None
            
            text = await loop.run_in_executor(
                executor, 
                whisper_service.transcribe_audio_data, 
                buffer_snapshot,
                "ja",
                5,
                prompt,
                actual_model_size
            )
            if text.strip() and state["running"]:
                # Update context
                state["last_transcript"] += text + " "
                
                await websocket.send_json({
                    "type": "final", 
                    "text": text.strip(), 
                    "timestamp": datetime.utcnow().timestamp()
                })
        except Exception as e:
            print(f"Final transcr error: {e}")

    try:
        while True:
            # Non-blocking receive (mostly)
            data = await websocket.receive_bytes()
            if not data:
                break
                
            chunk = np.frombuffer(data, dtype=np.float32)
            
            # Use Silero VAD
            is_speech = vad_service.is_speech(chunk, threshold=0.5)
            
            if is_speech:
                if not state["is_speaking"]:
                    state["is_speaking"] = True
                    state["last_partial_time"] = datetime.utcnow().timestamp()
                
                state["is_speaking"] = True
                state["silence_duration"] = 0.0
                state["audio_buffer"] = np.concatenate((state["audio_buffer"], chunk))
            else:
                if state["is_speaking"]:
                    state["silence_duration"] += len(chunk) / SAMPLE_RATE
                    state["audio_buffer"] = np.concatenate((state["audio_buffer"], chunk))
                    
                    if state["silence_duration"] > SILENCE_TIMEOUT:
                        # Utterance ended
                        process_buffer = state["audio_buffer"].copy()
                        state["audio_buffer"] = np.array([], dtype=np.float32)
                        state["is_speaking"] = False
                        state["silence_duration"] = 0.0
                        
                        # Spawn finalization task (don't block receiver)
                        asyncio.create_task(finalize_utterance(process_buffer))

            # Safety Buffer Limit (Automatic cut if too long)
            if len(state["audio_buffer"]) > SAMPLE_RATE * MAX_BUFFER_DURATION:
                process_buffer = state["audio_buffer"].copy()
                state["audio_buffer"] = np.array([], dtype=np.float32)
                state["is_speaking"] = False
                state["silence_duration"] = 0.0
                
                asyncio.create_task(finalize_utterance(process_buffer))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket Error: {e}")
    finally:
        state["running"] = False
        transcriber_task.cancel()
        try:
            await transcriber_task
        except asyncio.CancelledError:
            pass
        try:
            await websocket.close()
        except:
            pass
