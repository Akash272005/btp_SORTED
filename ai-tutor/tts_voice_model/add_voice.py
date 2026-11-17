"""
add_voice.py — Add a new cloned voice to the F5-TTS server
============================================================
Use this script whenever you want to add a new speaker voice.

It will:
  1. Trim the audio to an optimal 6-second clip (F5-TTS requirement)
  2. Transcribe the clip using Whisper to get the exact ref_text
  3. Save both files into the voices/ folder
  4. Print the .env snippet you need to use this voice as default

Usage:
    conda run -n xtts_env python add_voice.py <audio_file> <voice_name> [language]

Examples:
    conda run -n xtts_env python add_voice.py C:/Downloads/rahul.mp3 rahul hi
    conda run -n xtts_env python add_voice.py C:/Downloads/priya.wav priya en
"""

import sys
import os
import json
from pathlib import Path

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    input_file = sys.argv[1]
    voice_name = sys.argv[2].lower().strip()
    
    lang = "en"
    if len(sys.argv) >= 4:
        lang = sys.argv[3].lower().strip()
        if lang not in ("en", "hi"):
            print(f"WARNING: Unknown language '{lang}'. Defaulting to 'en'.")
            lang = "en"

    if not Path(input_file).exists():
        print(f"ERROR: File not found: {input_file}")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  Adding voice: {voice_name}")
    print(f"  Source file:  {input_file}")
    print(f"{'='*60}\n")

    try:
        from pydub import AudioSegment
    except ImportError:
        print("Installing pydub...")
        os.system(f"{sys.executable} -m pip install pydub -q")
        from pydub import AudioSegment

    try:
        import whisper
    except ImportError:
        print("Installing openai-whisper...")
        os.system(f"{sys.executable} -m pip install openai-whisper -q")
        import whisper

    # ── Load audio ──────────────────────────────────────────────────────────
    print(f"Loading audio: {input_file}")
    audio    = AudioSegment.from_file(input_file)
    duration = len(audio) / 1000.0
    print(f"Original duration: {duration:.1f}s")

    # ── Trim to 6 seconds ────────────────────────────────────────────────────
    # F5-TTS requires 3-10s reference audio.
    # We take a 6-second clip starting at 0.5s (avoids breath noise at start).
    if duration <= 6.0:
        trimmed = audio
        print(f"Audio is short ({duration:.1f}s) — using full clip.")
    else:
        start_ms = 500   # 0.5s offset
        end_ms   = 6500  # 6.5s → 6 second clip
        trimmed  = audio[start_ms:end_ms]
        print(f"Trimmed to 6.0s (0.5s → 6.5s)")

    # Normalize volume
    trimmed = trimmed.normalize()

    # Save trimmed WAV into voices/ folder
    voices_dir  = Path("voices")
    voices_dir.mkdir(exist_ok=True)
    output_wav  = voices_dir / f"{voice_name}.wav"
    trimmed.export(str(output_wav), format="wav")
    print(f"Saved: {output_wav}")

    # ── Transcribe ───────────────────────────────────────────────────────────
    print("\nTranscribing with Whisper (base model)...")
    import warnings
    warnings.filterwarnings("ignore")
    model  = whisper.load_model("base")
    result = model.transcribe(str(output_wav), language=lang)
    ref_text = result["text"].strip()

    print(f"\nTranscript: {repr(ref_text)}")

    # ── Save metadata ────────────────────────────────────────────────────────
    meta = {
        "voice_name":  voice_name,
        "wav_file":    str(output_wav),
        "ref_text":    ref_text,
        "duration_s":  round(len(trimmed) / 1000, 2),
        "source_file": str(input_file),
    }
    meta_file = voices_dir / f"{voice_name}_meta.json"
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"Metadata saved: {meta_file}")

    # ── Done ─────────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  Voice '{voice_name}' is ready!")
    print(f"{'='*60}")
    print(f"\nTo use in API requests, send:")
    print(f"""
  POST /synthesize
  {{
    "text": "Your text here",
    "voice": "{voice_name}"
  }}
""")
    print(f"To make it the DEFAULT voice, update .env:")
    print(f"  DEFAULT_VOICE=voices/{voice_name}.wav")
    print(f"  DEFAULT_REF_TEXT={ref_text}")
    print(f"\nVoice file:  {output_wav}")
    print(f"Meta file:   {meta_file}\n")

if __name__ == "__main__":
    main()
