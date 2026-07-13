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

## Cross-Platform Local Deployment

AI Subtitles is designed to run locally with native execution on both Windows and Mac (Apple Silicon / Intel). The backend will automatically detect your OS and optimize the hardware acceleration (CUDA for Windows, CPU/MPS fallback for Mac).

### Installation

**1. Clone the repository and install dependencies:**
```bash
pip install -r requirements.txt
```

**2. Setup CTranslate2 Models:**
Download and convert the translation model into the CTranslate2 format. Run the following command in your terminal:
```bash
ct2-transformers-converter --model facebook/nllb-200-distilled-1.3B --output_dir nllb-200-distilled-1.3B-ct2 --quantization int8_float16
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

## End-to-End Testing

We provide an automated End-to-End (E2E) testing suite using Playwright. This suite simulates a real user by injecting audio directly into a virtual microphone and records the entire UI interaction.

**Prerequisites:**
```bash
pip install playwright
playwright install chromium
```

**Running Tests:**
1. Ensure the server is running on port 8000.
2. Run the test script from the project root:
```bash
python tests/test_ui.py
```
3. The results, including screen recordings (`.webm`) and extracted transcriptions (`transcription.txt`), will be saved in the `tests/results/` directory.
