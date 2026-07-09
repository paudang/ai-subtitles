import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import uvicorn
from ai_pipeline import AIPipeline

app = FastAPI(title="AI Subtitles Server")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Singleton AI Pipeline (Loaded once)
pipeline = AIPipeline()

@app.get("/")
async def get_index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[SERVER] Client connected via WebSocket")
    session_buffer = bytearray()
    new_data_event = asyncio.Event()
    message_queue = asyncio.Queue()
    
    async def receive_loop():
        try:
            while True:
                message = await websocket.receive()
                await message_queue.put(message)
                new_data_event.set()
        except Exception:
            pass # Client disconnected

    receiver_task = asyncio.create_task(receive_loop())
    
    try:
        last_en_text = ""
        while True:
            await new_data_event.wait()
            new_data_event.clear()
            
            end_sentence_triggered = False
            
            # 1. Drain the queue sequentially to preserve the exact order of audio bytes and commands
            while not message_queue.empty():
                message = await message_queue.get()
                if "bytes" in message:
                    session_buffer.extend(message["bytes"])
                elif "text" in message:
                    import json
                    text_data = json.loads(message["text"])
                    if text_data.get("action") == "end_sentence":
                        end_sentence_triggered = True
                        break # Stop draining! Remaining bytes belong to the NEXT sentence
            
            if end_sentence_triggered:
                audio_to_process = bytes(session_buffer)
                session_buffer.clear() # Clear ONLY the old sentence's bytes
                
                if len(audio_to_process) > 0:
                    final_en_text = await asyncio.to_thread(pipeline.stt, audio_to_process, True)
                    if final_en_text:
                        vi_text = await asyncio.to_thread(pipeline.translate, final_en_text)
                        await websocket.send_json({
                            "en": final_en_text,
                            "vi": vi_text,
                            "status": "final"
                        })
                    else:
                        await websocket.send_json({"en": "", "vi": "", "status": "final"})
                else:
                    await websocket.send_json({"en": "", "vi": "", "status": "final"})
                
                last_en_text = ""
                
                # If there are already bytes for the new sentence, trigger the loop again instantly
                if not message_queue.empty():
                    new_data_event.set()
                continue
            
            # 2. Process partial STT if no command
            audio_to_process = bytes(session_buffer)
            if len(audio_to_process) > 0:
                en_text = await asyncio.to_thread(pipeline.stt, audio_to_process, False)
                
                # Only send if text actually changed (saves network bandwidth & UI renders)
                if en_text and en_text != last_en_text:
                    last_en_text = en_text
                    await websocket.send_json({
                        "en": en_text,
                        "vi": "",
                        "status": "partial"
                    })
                    
    except Exception as e:
        print(f"[SERVER] WebSocket Error: {e}")
    finally:
        receiver_task.cancel()
        print("[SERVER] Client disconnected")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
