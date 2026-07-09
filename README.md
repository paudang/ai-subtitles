# AI Subtitles

Enterprise-grade, real-time English-to-Vietnamese translation subtitles powered by local AI. 

Designed for high-performance rendering, zero-disk I/O processing, and zero-latency caching, allowing it to run smoothly on consumer hardware (e.g., RTX 2060).

## Features
- **Client-Side VAD (Voice Activity Detection):** Intelligently chunks audio streams only when speech stops, ensuring translation models have full sentence context.
- **In-Memory Pipeline:** Audio blobs are streamed directly into RAM (`io.BytesIO`), bypassing disk I/O bottlenecks completely.
- **Asynchronous Execution:** GPU-intensive tasks are run on separate threads (`asyncio.to_thread`), guaranteeing the WebSocket server never blocks.
- **Translation Caching:** Integrates LRU caching for the translation layer, serving repeated short phrases in 0ms without hitting the GPU.
- **DOM Virtualization:** The frontend maintains a strict maximum node count in the DOM history to prevent browser memory leaks during multi-hour sessions.

## Tech Stack
- **Backend:** Python, FastAPI, Uvicorn, WebSockets.
- **AI Models:** `faster-whisper` (STT), `facebook/nllb-200-distilled-600M` (Translation).
- **Frontend:** HTML5, Vanilla JS, Web Audio API, WebSockets.

## Installation

Ensure you have Python 3.10+ installed and an NVIDIA GPU (CUDA toolkit recommended).

```bash
pip install -r requirements.txt
```

## Running the Server

Start the WebSocket & Web server:
```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

1. Open `http://localhost:8000` in Chrome/Edge.
2. Grant microphone permissions.
3. Select your Audio Source (Mic or Stereo Mix).
4. Click **Start Listening** and speak English!
