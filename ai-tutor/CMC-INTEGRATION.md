# CMC Learning + AI Tutor

The complete Bixy AI Tutor source is included in this folder. CMC Learning links students to its frontend from the student dashboard.

## What is included

- `web/`: the full Next.js AI Tutor frontend and its feature pages/components.
- `src/`: the FastAPI backend, AI agents, RAG/document processing, LMS API, and SQLAlchemy database models.
- `config/`, `scripts/`, `tests/`, and `docs/`: source configuration, setup utilities, tests, and project documentation.
- `docker-compose.yml`: the AI Tutor service plus its PostgreSQL database and persistent database volume.

## Start the AI Tutor stack

1. Copy `.env.example` to `.env` inside this folder.
2. Add valid `LLM_API_KEY` and `EMBEDDING_API_KEY` values. Configure provider/model/host settings for the services you use.
3. From the CMC Learning repository root, run:

   ```bash
   docker compose --env-file ai-tutor/.env -f ai-tutor/docker-compose.yml up --build -d
   ```

4. Open the AI Tutor at `http://localhost:3782`. The FastAPI docs are at `http://localhost:8001/docs`.

Stop the stack with:

```bash
docker compose --env-file ai-tutor/.env -f ai-tutor/docker-compose.yml down
```

PostgreSQL data stays in the `ai_tutor_postgres_data` Docker volume. Uploaded knowledge bases and generated tutor content are stored under `ai-tutor/data/` and are ignored by Git. NCERT/source datasets are not bundled; load them with the included setup scripts if needed.

## Database boundary

CMC Learning currently uses MongoDB. The Bixy AI Tutor LMS uses PostgreSQL and SQLAlchemy. This integration keeps each app's database backend intact and runs both databases independently; the AI Tutor's PostgreSQL schema is created/migrated by its backend startup code. Tutor sign-in and CMC Learning sign-in remain separate accounts.

CMC Learning points to `http://localhost:3782` by default. Set `NEXT_PUBLIC_AI_TUTOR_URL` in the CMC Learning environment when the AI Tutor frontend is hosted elsewhere.

The CMC **AI PPT Learning** page generates narrated lessons from an NCERT chapter or lesson notes. Its slide player, questions, and quizzes are displayed inside CMC and use the Tutor API. See [AI PPT Learning](../AI_PPT_LEARNING.md).
