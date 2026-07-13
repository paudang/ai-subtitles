import os
import io
from functools import lru_cache
from faster_whisper import WhisperModel
from transformers import AutoTokenizer
import ctranslate2
import sys

# --- Fix missing CUDA DLL (cublas64_12.dll) on Windows ---
if os.name == 'nt':
    import site
    try:
        paths_to_add = []
        # Scan through all Python library installation directories
        for sp in site.getsitepackages() + [site.getusersitepackages()]:
            cublas_path = os.path.join(sp, "nvidia", "cublas", "bin")
            cudnn_path = os.path.join(sp, "nvidia", "cudnn", "bin")
            
            if os.path.exists(cublas_path) and cublas_path not in paths_to_add:
                os.add_dll_directory(cublas_path)
                paths_to_add.append(cublas_path)
            if os.path.exists(cudnn_path) and cudnn_path not in paths_to_add:
                os.add_dll_directory(cudnn_path)
                paths_to_add.append(cudnn_path)
                
        if paths_to_add:
            os.environ["PATH"] = ";".join(paths_to_add) + ";" + os.environ.get("PATH", "")
    except Exception as e:
        print(f"[WARNING] Could not add CUDA DLLs: {e}")
# -------------------------------------------------------------

class AIPipeline:
    def __init__(self):
        print("[AI] Initializing AIPipeline (V3 CTranslate2)...")
        
        # --- Cross-Platform Compatibility ---
        self.device = "cuda" if sys.platform != "darwin" else "cpu"
        self.compute_type = "float16" if self.device == "cuda" else "int8"
        
        # 1. Initialize Whisper (STT)
        print(f"[AI] Loading Whisper Model (faster-whisper - small.en) on {self.device}...")
        self.whisper = WhisperModel("small.en", device=self.device, compute_type=self.compute_type)
        
        # 2. Initialize NLLB (Translation) via CTranslate2
        print("[AI] Loading Translation Model (NLLB 1.3B - CTranslate2)...")
        model_name = "facebook/nllb-200-distilled-1.3B"
        ct2_model_path = "nllb-200-distilled-1.3B-ct2"
        
        if not os.path.exists(ct2_model_path):
            print(f"\n[FATAL ERROR] CTranslate2 model not found at '{ct2_model_path}'!")
            print("Please stop the server and run this command in your terminal:")
            print("ct2-transformers-converter --model facebook/nllb-200-distilled-1.3B --output_dir nllb-200-distilled-1.3B-ct2 --quantization int8_float16")
            print("Exiting...\n")
            os._exit(1)
            
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        # Load CTranslate2 Translator using the appropriate compute type
        ct2_compute_type = "int8_float16" if self.device == "cuda" else "int8"
        self.translator = ctranslate2.Translator(ct2_model_path, device=self.device, compute_type=ct2_compute_type)
        
        print(f"[AI] Models loaded successfully into {self.device.upper()}!")

    @lru_cache(maxsize=1000)
    def _translate_cached(self, english_text: str) -> str:
        """
        Cached translation to bypass GPU for repeated common phrases.
        Uses CTranslate2 optimized inference for ultra-low latency.
        """
        # Tokenize source sentence
        source_tokens = self.tokenizer.convert_ids_to_tokens(self.tokenizer.encode(english_text))
        
        # Prepare target prefix (NLLB requires the target language token at the start)
        # NLLB tokens are exactly the language codes like "vie_Latn"
        target_prefix = ["vie_Latn"]
        
        # Run inference via CTranslate2 C++ engine
        results = self.translator.translate_batch([source_tokens], target_prefix=[target_prefix])
        
        # Decode target tokens (remove the first token which is the language code)
        target_tokens = results[0].hypotheses[0][1:] 
        vietnamese_text = self.tokenizer.decode(self.tokenizer.convert_tokens_to_ids(target_tokens))
        
        return vietnamese_text

    def stt(self, audio_bytes: bytes, is_final: bool = False) -> str:
        """
        Step 1: Speech to Text (English)
        """
        try:
            audio_io = io.BytesIO(audio_bytes)
            # Beam size 1 for instant real-time speed, 5 for final accuracy
            beam = 5 if is_final else 1
            
            # VAD filter adds overhead. Only use it for the final cleanup pass.
            use_vad = True
            
            # HUGE SPEEDUP: Force language="en" to skip the 10-20ms language detection phase
            segments, info = self.whisper.transcribe(
                audio_io, 
                beam_size=beam, 
                vad_filter=use_vad,
                language="en",
                condition_on_previous_text=False,
                without_timestamps=True
            )
            
            valid_segments = []
            for segment in segments:
                # Filter out pure noise/hallucinations
                if segment.no_speech_prob < 0.6:
                    valid_segments.append(segment.text)
                else:
                    print(f"[AI] Ignored hallucination (no_speech_prob={segment.no_speech_prob:.2f}): {segment.text}")
                    
            english_text = " ".join(valid_segments).strip()
            return english_text
        except Exception as e:
            print(f"[ERROR] STT failed: {e}")
            return ""

    def translate(self, english_text: str) -> str:
        """
        Step 2: Translation (Vietnamese)
        """
        if not english_text:
            return ""
        try:
            import re
            # NLLB 1.3B distil drops sentences if the paragraph is too long.
            # Split by punctuation followed by space AND a Capital letter to avoid breaking abbreviations (Mr., U.S.A).
            sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', english_text)
            
            translated_sentences = []
            for sentence in sentences:
                if sentence.strip():
                    # Translate each sentence individually
                    trans = self._translate_cached(sentence.strip())
                    translated_sentences.append(trans)
                    
            return " ".join(translated_sentences)
        except Exception as e:
            print(f"[ERROR] Translation failed: {e}")
            return ""
