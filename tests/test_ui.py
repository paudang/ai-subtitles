import asyncio
from playwright.async_api import async_playwright
import os

async def run_test(video_wav_path, output_video_dir):
    print(f"\n==============================")
    print(f"Testing with {video_wav_path}")
    print(f"==============================")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
                f'--use-file-for-fake-audio-capture={video_wav_path}',
                '--autoplay-policy=no-user-gesture-required'
            ]
        )
        context = await browser.new_context(
            record_video_dir=output_video_dir,
            record_video_size={"width": 1280, "height": 720}
        )
        page = await context.new_page()
        
        await page.goto("http://localhost:8000")
        
        # Click start
        print("Starting recording...")
        await page.click("#voiceBtn")
        
        duration = 45 if 'video1' in video_wav_path else 75
        print(f"Waiting for {duration} seconds to allow audio to process...")
        await page.wait_for_timeout(duration * 1000)
        
        print("Stopping recording...")
        await page.click("#voiceBtn")
        await page.wait_for_timeout(3000) # wait for final translation
        
        # Extract text for analysis
        history = await page.inner_text("#history-box")
        text_log_path = os.path.join(output_video_dir, "transcription.txt")
        with open(text_log_path, "w", encoding="utf-8") as f:
            f.write(history)
        print(f"Saved text to {text_log_path}")
        
        await context.close()
        await browser.close()
        
        print(f"Saved video recording of UI in: {output_video_dir}")

async def main():
    os.makedirs("tests/results/video1", exist_ok=True)
    os.makedirs("tests/results/video2", exist_ok=True)
    os.makedirs("tests/results/video3", exist_ok=True)
    
    path1 = os.path.abspath("tests/audios_wav/video1.wav")
    path2 = os.path.abspath("tests/audios_wav/video2.wav")
    path3 = os.path.abspath("tests/audios_wav/video3.wav")
    
    await run_test(path1, "tests/results/video1")
    await run_test(path2, "tests/results/video2")
    await run_test(path3, "tests/results/video3")

if __name__ == "__main__":
    asyncio.run(main())
