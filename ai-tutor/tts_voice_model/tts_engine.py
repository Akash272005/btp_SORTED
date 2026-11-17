"""
tts_engine.py — F5-TTS Voice Cloning Engine
=============================================
Supports multiple speaker voices.
Each voice lives in voices/<name>.wav with an optional voices/<name>_meta.json
containing its exact ref_text for accurate pitch/tone/pace cloning.

Add new voices using:
    python add_voice.py <audio_file> <voice_name>

Usage:
    from tts_engine import TTSEngine
    engine = TTSEngine()
    result = engine.synthesize("Hello!", speaker_wav="voices/rahul.wav")
"""

import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import uuid
import json
import logging
import time
from pathlib import Path
from typing import Optional

import torch
import soundfile as sf
from dotenv import load_dotenv

try:
    from f5_tts.api import F5TTS
except ImportError:
    F5TTS = None

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("tts_engine")

PHONETIC_HINDI_REF_TEXT = {
    "anjali_trimmed": "लेट मी स्टार्ट विद अ सिंपल क्वेश्चन. हाउ डू यू फाइंड अ वर्ड इन अ डिक्शनरी?",
    "anjali": "लेट मी स्टार्ट विद अ सिंपल क्वेश्चन. हाउ डू यू फाइंड अ वर्ड इन अ डिक्शनरी?",
    "sagar": "फाइव थाउजेंड रुपीस मंथली फ्रॉम एज ट्वेंटी फाइव. बाय फोर्टी फाइव यू हैव थर्टी एट लैक्स.",
    "max": "क्लास लेट मी स्टार्ट विद अ सिंपल क्वेश्चन. हाउ डू यू फाइंड अ वर्ड इन अ डिक्शनरी?"
}


class TTSEngine:
    """
    F5-TTS multi-voice engine.

    Supports unlimited speaker voices. Each voice is a WAV file in voices/
    with an accompanying _meta.json containing the exact ref_text.

    Quality parameters:
      - ref_text    : EXACT transcript of the reference audio clip (most important)
      - nfe_step    : Inference steps (64 = good balance, 128 = best quality)
      - cfg_strength: Voice fidelity (2.5 = faithful pitch/tone reproduction)
      - speed       : Speaking rate multiplier (1.0 = match reference)
    """

    def __init__(self, device: str = None, output_dir: str = None):
        if F5TTS is None:
            raise ImportError("f5-tts is not installed. Run: pip install f5-tts")

        self.output_dir = Path(output_dir or os.getenv("OUTPUT_DIR", "outputs"))
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # ── Device ─────────────────────────────────────────────────────────
        raw_device = device or os.getenv("DEVICE", "auto")
        self.device = "cuda" if (raw_device == "auto" and torch.cuda.is_available()) else raw_device
        if raw_device != "auto":
            self.device = raw_device

        logger.info(f"Device: {self.device.upper()}")
        if self.device == "cuda":
            logger.info(f"GPU: {torch.cuda.get_device_name(0)}")

        # ── Quality parameters ──────────────────────────────────────────────
        self.nfe_step           = int(os.getenv("NFE_STEP", 64))
        self.cfg_strength       = float(os.getenv("CFG_STRENGTH", 2.5))
        self.speed              = float(os.getenv("SPEED", 1.0))
        self.sway_sampling_coef = float(os.getenv("SWAY_SAMPLING_COEF", -1.0))

        logger.info(f"Quality: nfe_step={self.nfe_step}, cfg_strength={self.cfg_strength}, speed={self.speed}")

        # ── Load F5-TTS model ───────────────────────────────────────────────
        logger.info("Loading F5-TTS model ...")
        t0 = time.time()
        self.models = {}
        self.models["en"] = F5TTS(device=self.device)
        self.tts = self.models["en"]
        logger.info(f"F5-TTS ready in {time.time() - t0:.1f}s ✓")

        # ── Default voice ───────────────────────────────────────────────────
        self.default_speaker_wav = os.getenv("DEFAULT_VOICE", "voices/anjali_trimmed.wav")
        self.default_language    = os.getenv("DEFAULT_LANGUAGE", "en")
        self.default_ref_text    = os.getenv("DEFAULT_REF_TEXT", "")

        # ── Load all voice metadata (ref_text per voice) ────────────────────
        self._voice_meta: dict[str, dict] = {}
        self._load_all_voice_meta()

        if not Path(self.default_speaker_wav).exists():
            logger.warning(f"Default voice not found: {self.default_speaker_wav}")
        else:
            logger.info(f"Default voice: {self.default_speaker_wav} ✓")

        if self.default_ref_text:
            logger.info(f"Default ref_text loaded ({len(self.default_ref_text)} chars) ✓")
        else:
            logger.warning("DEFAULT_REF_TEXT not set — Whisper will auto-transcribe (less accurate)")

    def _get_model(self, language: Optional[str] = None):
        """Get the model instance for the specified language, loading it if not cached."""
        lang = (language or self.default_language).lower().strip()
        lang_key = "hi" if lang in ("hi", "hindi") else "en"

        if lang_key not in self.models:
            logger.info(f"Loading F5-TTS model for language '{lang_key.upper()}' ...")
            t0 = time.time()
            if lang_key == "hi":
                try:
                    from huggingface_hub import hf_hub_download
                    logger.info("Downloading/loading Hindi model from HF: SPRINGLab/F5-Hindi-24KHz ...")
                    ckpt_file = hf_hub_download(repo_id="SPRINGLab/F5-Hindi-24KHz", filename="model_2500000.safetensors")
                    vocab_file = hf_hub_download(repo_id="SPRINGLab/F5-Hindi-24KHz", filename="vocab.txt")
                    
                    self.models["hi"] = F5TTS(
                        model="F5TTS_Small",
                        ckpt_file=ckpt_file,
                        vocab_file=vocab_file,
                        device=self.device
                    )
                except Exception as e:
                    logger.error(f"Failed to load Hindi model: {e}", exc_info=True)
                    raise RuntimeError(f"Failed to load Hindi model: {e}") from e
            else:
                self.models["en"] = F5TTS(device=self.device)
            logger.info(f"F5-TTS model for '{lang_key.upper()}' ready in {time.time() - t0:.1f}s ✓")

        return self.models[lang_key]

    # ── Voice metadata ──────────────────────────────────────────────────────
    def _load_all_voice_meta(self):
        """Load ref_text for every voice that has a _meta.json file."""
        voices_dir = Path("voices")
        if not voices_dir.exists():
            return
        for meta_file in voices_dir.glob("*_meta.json"):
            try:
                with open(meta_file, encoding="utf-8") as f:
                    meta = json.load(f)
                voice_name = meta.get("voice_name") or meta_file.stem.replace("_meta", "")
                self._voice_meta[voice_name] = meta
                logger.info(f"Loaded voice metadata: {voice_name} (ref_text: {len(meta.get('ref_text',''))} chars)")
            except Exception as e:
                logger.warning(f"Could not read {meta_file}: {e}")

    def _get_ref_text_for_voice(self, voice_wav_path: str, explicit_ref_text: Optional[str], lang_key: str = "en") -> str:
        """
        Return the best ref_text for the given voice file.
        Priority: explicit arg > voice metadata > .env default > empty (Whisper fallback)
        """
        voice_name = Path(voice_wav_path).stem

        # If Hindi model is active and no explicit ref_text is provided, check default phonetic maps
        if lang_key == "hi" and explicit_ref_text is None:
            if voice_name in PHONETIC_HINDI_REF_TEXT:
                logger.info(f"Using phonetic Devnagari transcript for English voice '{voice_name}'")
                return PHONETIC_HINDI_REF_TEXT[voice_name]

        if explicit_ref_text is not None:
            return explicit_ref_text

        # Look up by voice name (stem of wav file)
        if voice_name in self._voice_meta:
            meta_text = self._voice_meta[voice_name].get("ref_text", "")
            if lang_key == "hi" and meta_text and any(c.isalpha() for c in meta_text):
                logger.warning(
                    f"Voice '{voice_name}' has an English transcript but is being used with the Hindi model. "
                    f"This may result in garbage voice. Please provide a phonetic Devnagari transcript."
                )
            return meta_text

        # Fall back to .env default (only for the default voice)
        if voice_wav_path == self.default_speaker_wav:
            if lang_key == "hi":
                logger.info("Using phonetic Devnagari transcript for default English voice")
                return PHONETIC_HINDI_REF_TEXT.get("anjali_trimmed", self.default_ref_text)
            return self.default_ref_text

        return ""  # Whisper will auto-transcribe

    # ── synthesize ──────────────────────────────────────────────────────────
    def synthesize(
        self,
        text: str,
        speaker_wav: Optional[str] = None,
        language: Optional[str] = None,
        ref_text: Optional[str] = None,
        output_filename: Optional[str] = None,
        nfe_step: Optional[int] = None,
        cfg_strength: Optional[float] = None,
        speed: Optional[float] = None,
    ) -> dict:
        """
        Synthesize speech using zero-shot voice cloning.

        Args:
            text:            Text to synthesize.
            speaker_wav:     Path to reference WAV (3-10s clip). Defaults to DEFAULT_VOICE.
            language:        Language hint (informational only).
            ref_text:        Exact transcript of speaker_wav. Auto-loaded from metadata if available.
            output_filename: Optional output filename without extension.
            nfe_step:        Override inference steps (default: 64).
            cfg_strength:    Override CFG strength (default: 2.5).
            speed:           Override speaking speed (default: 1.0).

        Returns:
            dict: output_path, filename, duration, text, language
        """
        lang = (language or self.default_language).lower().strip()
        lang_key = "hi" if lang in ("hi", "hindi") else "en"

        speaker_wav = speaker_wav or self.default_speaker_wav
        ref_text    = self._get_ref_text_for_voice(speaker_wav, ref_text, lang_key=lang_key)

        _nfe_step     = nfe_step     if nfe_step     is not None else self.nfe_step
        _cfg_strength = cfg_strength if cfg_strength is not None else self.cfg_strength
        _speed        = speed        if speed        is not None else self.speed

        if not text or not text.strip():
            raise ValueError("Text cannot be empty.")
        max_len = int(os.getenv("MAX_TEXT_LENGTH", 5000))
        if len(text) > max_len:
            raise ValueError(f"Text exceeds {max_len} characters.")
        if not Path(speaker_wav).exists():
            raise FileNotFoundError(f"Voice file not found: {speaker_wav}")

        # Standardize Hindi full stops (danda "।") to English full stops (".")
        # so that the sentence/text splitter in f5_tts.infer.utils_infer (chunk_text)
        # can correctly split the text into batches.
        gen_text = text
        if language and language.lower() in ("hi", "hindi"):
            gen_text = gen_text.replace("।", ".")

        # Estimate duration to prevent sequence length exceeding position embeddings (max 8192 frames)
        # and causing PyTorch shape mismatch crashes.
        fix_duration = None
        import torchaudio
        try:
            audio_info = torchaudio.info(str(speaker_wav))
            ref_audio_len = audio_info.num_frames // 256  # hop_length is 256
            ref_text_len = len(ref_text.strip().encode("utf-8"))
            gen_text_len = len(gen_text.strip().encode("utf-8"))
            
            if ref_text_len > 0:
                est_duration = ref_audio_len + int((ref_audio_len / ref_text_len) * gen_text_len / _speed)
            else:
                est_duration = ref_audio_len + int(10 * gen_text_len / _speed)
                
            if est_duration > 8000:
                logger.warning(
                    f"Suspiciously high estimated duration ({est_duration} frames). "
                    f"Capping duration to prevent out-of-bounds positional embedding crash."
                )
                est_duration = min(ref_audio_len + int(10 * gen_text_len / _speed), 8000)
                fix_duration = (est_duration * 256) / 24000
        except Exception as e:
            logger.warning(f"Failed to estimate duration check: {e}")

        fname = output_filename or str(uuid.uuid4())
        if not fname.endswith(".wav"):
            fname += ".wav"
        output_path = self.output_dir / fname

        logger.info(
            f"Synthesizing | voice={Path(speaker_wav).name} | "
            f"chars={len(gen_text)} | nfe={_nfe_step} | cfg={_cfg_strength} | speed={_speed}"
        )
        if ref_text:
            logger.info(f"ref_text: '{ref_text[:60]}...' ({len(ref_text)} chars)")
        else:
            logger.info("ref_text empty — Whisper will auto-transcribe")
        t0 = time.time()

        model = self._get_model(language)

        wav, sr, _ = model.infer(
            ref_file=str(speaker_wav),
            ref_text=ref_text,
            gen_text=gen_text,
            nfe_step=_nfe_step,
            cfg_strength=_cfg_strength,
            speed=_speed,
            sway_sampling_coef=self.sway_sampling_coef,
            remove_silence=True,
            fix_duration=fix_duration,
        )

        sf.write(str(output_path), wav, sr)
        elapsed  = time.time() - t0
        duration = round(len(wav) / sr, 2)

        logger.info(f"Done in {elapsed:.2f}s | audio duration ≈ {duration}s ✓")

        return {
            "output_path": str(output_path.resolve()),
            "filename":    fname,
            "duration":    duration,
            "text":        text,
            "language":    language or self.default_language,
        }

    # ── list_voices ─────────────────────────────────────────────────────────
    def list_voices(self, voices_dir: str = "voices") -> list[dict]:
        """List all available voice reference files with their metadata."""
        path = Path(voices_dir)
        if not path.exists():
            return []

        voices = []
        for f in sorted(path.iterdir()):
            if f.suffix.lower() not in {".mp3", ".wav", ".flac", ".ogg"}:
                continue
            # Skip original long files if trimmed version exists
            if f.suffix.lower() == ".mp3" and (path / f"{f.stem}_trimmed.wav").exists():
                continue

            voice_name = f.stem
            meta = self._voice_meta.get(voice_name, {})
            voices.append({
                "name":         voice_name,
                "filename":     f.name,
                "path":         str(f),
                "size_kb":      round(f.stat().st_size / 1024, 1),
                "has_ref_text": bool(meta.get("ref_text")),
                "ref_text_preview": (meta.get("ref_text", "")[:60] + "...") if meta.get("ref_text") else None,
            })
        return voices

    # ── info ────────────────────────────────────────────────────────────────
    def info(self) -> dict:
        return {
            "model":            "F5-TTS",
            "device":           self.device,
            "default_voice":    self.default_speaker_wav,
            "default_language": self.default_language,
            "voices_loaded":    len(self._voice_meta),
            "models_loaded":    list(self.models.keys()),
            "nfe_step":         self.nfe_step,
            "cfg_strength":     self.cfg_strength,
            "speed":            self.speed,
            "cuda_available":   torch.cuda.is_available(),
            "gpu_name":         torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        }
