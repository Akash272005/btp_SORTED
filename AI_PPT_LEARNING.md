# AI PPT Learning

Open **AI PPT Learning** from the student or educator dashboard. Choose an NCERT chapter or paste lesson notes, choose English or Hindi, and start the lesson. The AI teacher explains each slide aloud. Learners can pause or replay the narration, ask about the current slide, and take quizzes. The previous slide's quiz score adjusts the difficulty of the next quiz.

Start the Tutor services using [CMC-INTEGRATION.md](ai-tutor/CMC-INTEGRATION.md). CMC Learning calls the Tutor backend at `http://127.0.0.1:8001` by default. Set `AI_TUTOR_API_URL` in CMC Learning if the backend uses a different address. Configure the Tutor's LLM and speech provider for lesson generation and narration.

## Optional F5 voice service

The original LearningBIX F5 voice server is in `ai-tutor/tts_voice_model`. To use it, install that folder's requirements in a separate Python environment, configure `DEFAULT_VOICE` with the path to a reference WAV you can use and `DEFAULT_REF_TEXT` with its transcript, then run `python tts_server.py` from that folder. Set `AVATAR_F5_TTS_URL=http://127.0.0.1:8765` in the CMC environment and restart CMC. Without this variable, CMC uses the speech provider configured in the Tutor.
