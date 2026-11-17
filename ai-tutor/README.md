# 📚 bixy_AiTutor

<div align="center">
  <img src="assets/logo-ver2.png" alt="bixy_AiTutor Logo" width="150" style="border-radius: 15px; margin-bottom: 20px;">
  <p><b>Multi-Agent AI Teaching & Research Platform</b></p>
  <p><i>Knowledge Q&A • Learning Visualization • Exam Prep • Deep Research • NCERT Aligned</i></p>

  [![Python](https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python)](https://www.python.org/)
  [![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-00a393?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
  [![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?style=for-the-badge&logo=docker)](https://www.docker.com/)
  [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge)](https://opensource.org/licenses/Apache-2.0)
  [![Version](https://img.shields.io/badge/Version-0.5.0-green?style=for-the-badge)](https://github.com/learningBix/bixy_AiTutor)
</div>

---

## 🌟 What is bixy_AiTutor?

**bixy_AiTutor** is a state-of-the-art, multi-agent AI platform built to transform how students and researchers learn, study, and discover knowledge. It combines:

- **RAG (Retrieval-Augmented Generation)** — answers strictly from your uploaded documents or NCERT textbooks
- **Web Research** — real-time internet-augmented answers for current affairs
- **Expert Reasoning Loops** — multi-agent collaboration for solving complex problems
- **Immersive Avatar UI** — 3D AI teacher with synchronized TTS narration

> Designed specifically for the **Indian K-12 and higher-ed** ecosystem, supporting Classes 6–12, NCERT curriculum alignment, NPTEL/Swayam integration, and vLLM-based high-throughput inference.

---

## ✨ Core Modules

| Module | Description | Key Capabilities |
|:---|:---|:---|
| 🧠 **Smart Solver** | Multi-agent problem solving with dual-loop reasoning | RAG + Web checks, Code execution context |
| 📝 **Question Gen** | Generate practice questions from uploaded material | Mimic Mode (clone exam styles), Custom KB-based generation |
| 🎓 **Guided Learning** | Personalized learning paths from your notes | Interactive visualizations, step-by-step breakdowns, adaptive Q&A |
| 🔬 **Deep Research** | Systematic research on any topic or knowledge base | Dynamic Topic Queue, Literature reviews, Structured reports |
| ✏️ **Co-Writer** | AI-powered writing assistant | Recursive editing, Auto-annotation, TTS Narration (Narrator agent) |
| 💡 **IdeaGen** | Discover novel concepts and research directions | Brainstorming, Concept synthesis, Cross-domain insights |

---

## 🗂️ 4-Pillar Content Strategy

The learning interface uses **4 source tabs** so students always know where an answer comes from:

| Tab | Source | Use Case |
|:---|:---|:---|
| 📘 **NCERT Verified** | Strictly NCERT RAG boundary | Safe, syllabus-accurate answers only |
| 🌐 **Current Web** | Internet-augmented search | Latest information & contemporary topics |
| 🎓 **NPTEL / Swayam** | IIT professor lectures & e-courses | Engineering, Science deep-dives |
| 🎬 **YouTube Explanations** | YouTube Data API v3 | Visual explanations tailored to the topic |

---

## 🎭 Key Features

### Avatar + Immersive Learning
- Customizable **3D teacher character** reads answers aloud
- **Synchronized lip movements** using TTS + NLP multimodal integration
- Engaging, conversational tutor experience — not just plain text

### 🛡️ Guardrails for K-12 Safety
- **Context Bounds** — AI only answers within the student's class & subject scope
- **Bite-Sized Delivery** — Responses formatted as 3–5 concise bullet points; no wall-of-text

### 🚀 High-Throughput Infrastructure
- **vLLM Inference** — Serves 20–30 students simultaneously on a single GPU
- **Indian Data Residency** — One GPU server handles ~500 students with 100% data compliance
- Seamless fallback to cloud APIs (OpenAI, Anthropic, Gemini) if vLLM is unavailable

### 🗃️ NCERT Diagram Rendering
- Extracts images directly from NCERT PDFs using `ncert_image_extractor.py`
- Serves Base64 data URIs to the frontend for inline rendering
- Bypasses ReactMarkdown filtering for reliable, high-quality diagram display

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (web/)                   │
│   Next.js 16 + React 19 + Tailwind CSS              │
│   - Chat UI, Avatar Narrator, Dashboard             │
│   - i18n (multilingual), Role-based access          │
└───────────────────┬─────────────────────────────────┘
                    │ HTTP / REST
┌───────────────────▼─────────────────────────────────┐
│              Backend API (src/api/)                  │
│   FastAPI — Async endpoints, streaming responses     │
└───────────────────┬─────────────────────────────────┘
                    │ Agent dispatch
┌───────────────────▼─────────────────────────────────┐
│          Multi-Agent Engine (src/agents/)            │
│   Solve • Question • Guide • Research                │
│   CoWriter • IdeaGen • Chat • Narrator               │
└───────┬──────────────────────┬──────────────────────┘
        │ RAG                  │ Tools
┌───────▼──────┐    ┌──────────▼──────────────────────┐
│  Knowledge   │    │   Tools (src/tools/)             │
│  (src/       │    │   Web Search, Code Exec,         │
│  knowledge/) │    │   YouTube API, TTS, NCERT Images │
│  LlamaIndex, │    └─────────────────────────────────┘
│  Docling,    │
│  PyMuPDF     │
└──────────────┘
```

---

## 📂 Project Structure

```
bixy_AiTutor/
├── config/                    # Centralized configuration
│   ├── main.yaml              # System settings, tools toggle, output paths
│   └── agents.yaml            # Per-agent temperature, max_tokens, behavior
│
├── src/
│   ├── agents/                # Multi-agent orchestration
│   │   ├── solve/             # Smart Solver agent
│   │   ├── question/          # Question Generator agent
│   │   ├── guide/             # Guided Learning agent
│   │   ├── research/          # Deep Research agent
│   │   ├── co_writer/         # Co-Writer + Narrator agent
│   │   ├── ideagen/           # IdeaGen agent
│   │   └── chat/              # Chat agent (main conversational loop)
│   │
│   ├── api/                   # FastAPI app, routing, HTTP models
│   ├── core/                  # Core abstractions shared across agents
│   ├── knowledge/             # RAG embedding logic, vector store abstractions
│   ├── services/              # External service integrations (TTS, search)
│   ├── tools/                 # Custom executable tools for agents
│   ├── utils/
│   │   └── ncert_image_extractor.py   # NCERT PDF diagram extraction
│   └── logging/               # Structured logging setup
│
├── web/                       # Next.js frontend
│   ├── app/                   # Next.js App Router pages
│   ├── components/            # Reusable UI components
│   │   └── AvatarNarrator.tsx # 3D Avatar + TTS component
│   ├── hooks/                 # Custom React hooks
│   ├── context/               # React context providers
│   ├── i18n/                  # Internationalization config
│   └── locales/               # Translation files
│
├── scripts/                   # Bootstrap, ingestion & maintenance utilities
│   ├── install_all.py         # Full dependency installer
│   ├── start_web.py           # Start backend + frontend simultaneously
│   ├── download_ncert_pdfs.py # Download NCERT PDFs automatically
│   ├── ingest_ncert.py        # Embed NCERT PDFs into RAG pipeline
│   ├── import_local_ncert.py  # Import local NCERT PDFs
│   ├── setup_ncert_workspace.py # Bootstrap NCERT knowledge base
│   ├── generate_ncert_manifest.py # Generate NCERT content manifest
│   ├── audit_prompts.py       # Assert prompt integrity
│   ├── sync_prompts_from_en.py # Sync multilingual prompts
│   ├── migrate_kb.py          # Knowledge base migration utility
│   ├── deploy_production.sh   # Production deployment script
│   └── check_install.py       # Verify installation health
│
├── data/                      # Local data mounts (KB, logs, outputs)
├── ncert_source/              # NCERT PDF source files
├── tests/                     # Test suite (pytest)
├── assets/                    # Static assets (logos, images)
├── Dockerfile                 # Container build definition
├── docker-compose.yml         # Multi-service production setup
├── docker-compose.dev.yml     # Development override config
├── requirements.txt           # Python backend dependencies
├── pyproject.toml             # Python tooling config (Black, Ruff, MyPy)
└── .env.example               # Environment variable template
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version | Purpose |
|:---|:---|:---|
| Python | 3.10+ | Backend runtime |
| Node.js | 18+ | Frontend build |
| Docker + Docker Compose | Latest | Containerized setup |
| NVIDIA GPU (optional) | CUDA-enabled | vLLM high-throughput |

---

### Step 1 — Configure Environment

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Open `.env` and set the following required keys:

```env
# ── LLM (Primary AI Model) ──────────────────────────────
LLM_BINDING=openai          # openai | anthropic | gemini | local
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-xxx
LLM_HOST=https://api.openai.com/v1

# ── Embedding (for RAG) ──────────────────────────────────
EMBEDDING_BINDING=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_API_KEY=sk-xxx

# ── Web Search (optional) ────────────────────────────────
SEARCH_PROVIDER=perplexity  # perplexity | tavily | serper | jina | exa
SEARCH_API_KEY=pplx-xxx

# ── TTS Narration (optional) ──────────────────────────────
TTS_BINDING=openai
TTS_MODEL=tts-1
TTS_VOICE=alloy
TTS_API_KEY=sk-xxx

# ── YouTube Tab (optional) ────────────────────────────────
YOUTUBE_API_KEY=            # Get free key: console.cloud.google.com
```

---

### Step 2A — Docker Setup *(Recommended)*

No manual Python/Node.js setup required:

```bash
docker compose up -d
```

| Service | URL |
|:---|:---|
| 🌐 Frontend App | http://localhost:3782 |
| 📡 Backend API Docs | http://localhost:8001/docs |

> **For vLLM (GPU):** requires NVIDIA GPU + `nvidia-container-toolkit`
> ```bash
> docker compose --profile vllm up -d
> # Then set in .env:
> # LLM_HOST=http://vllm:8000/v1
> # LLM_BINDING=local
> ```

---

### Step 2B — Manual / Dev Setup

For developers who want to modify core logic or debug locally:

**1. Install all dependencies:**
```bash
python scripts/install_all.py
```

**2. Start backend + frontend together:**
```bash
python scripts/start_web.py
```

**Or start separately:**
```bash
# Backend (FastAPI)
uvicorn src.api.app:app --host 0.0.0.0 --port 8001 --reload

# Frontend (Next.js)
cd web && npm run dev
```

---

### Step 3 — Load NCERT Knowledge Base *(Optional)*

To enable NCERT-verified Q&A, ingest textbooks into the RAG pipeline:

```bash
# Option A — Download automatically from official NCERT website
python scripts/download_ncert_pdfs.py

# Option B — Use locally available PDFs
python scripts/import_local_ncert.py

# Step 2 — Embed into RAG vector store
python scripts/ingest_ncert.py
```

---

## ⚙️ Configuration Reference

All system behavior is controlled via YAML — no source code changes needed.

### `config/main.yaml`
| Key | Description |
|:---|:---|
| `web_search` | Enable/disable web search tool (`true`/`false`) |
| `output_dir` | Local directory for agent outputs (`./data`) |
| `dataset_schema` | Knowledge base structure definitions |
| `fallback_behavior` | What to do if RAG returns no results |

### `config/agents.yaml`
| Key | Description |
|:---|:---|
| `temperature` | Creativity vs determinism per agent |
| `max_tokens` | Output length limit per agent workflow |
| Agent configs | Solve, Question, IdeaGen, Narrator, Guide, Research |

---

## 🛠️ Scripts Reference

| Script | Purpose |
|:---|:---|
| `install_all.py` | Full installation of Python + Node.js dependencies |
| `start_web.py` | Launch backend + frontend simultaneously |
| `check_install.py` | Verify installation health and dependencies |
| `download_ncert_pdfs.py` | Download NCERT PDFs (Class 6–12, all subjects) |
| `import_local_ncert.py` | Import locally stored NCERT PDFs |
| `ingest_ncert.py` | Embed NCERT content into Wembedding/RAG store |
| `setup_ncert_workspace.py` | Bootstrap NCERT workspace and directory structure |
| `generate_ncert_manifest.py` | Generate content manifest for all NCERT books |
| `migrate_kb.py` | Migrate knowledge base between versions |
| `audit_prompts.py` | Verify prompt files integrity across agents |
| `sync_prompts_from_en.py` | Sync multilingual prompt translations |
| `deploy_production.sh` | Full production deployment automation |

---

## 🔌 Supported Integrations

### LLM Providers
| Provider | `LLM_BINDING` Value |
|:---|:---|
| OpenAI (GPT-4o, etc.) | `openai` |
| Anthropic (Claude) | `anthropic` |
| Google Gemini | `gemini` |
| Local via vLLM | `local` |
| Alibaba DashScope | `dashscope` |

### Search Providers
`perplexity` · `tavily` · `serper` · `jina` · `exa` · `baidu`

### Embedding Models
OpenAI `text-embedding-3-small/large` · or any compatible API

### Cloud Scalability (Azure AI Search)
```env
AZURE_SEARCH_ENDPOINT=https://your-search-service.search.windows.net
AZURE_SEARCH_KEY=your-admin-key
AZURE_SEARCH_INDEX_NAME=bixy-ncert-index
```

---

## 📦 Tech Stack

| Layer | Technology |
|:---|:---|
| **Frontend** | Next.js 16, React 19, Tailwind CSS, TypeScript |
| **Backend** | FastAPI, Python 3.10+, Uvicorn |
| **AI / LLM** | OpenAI, Anthropic, Gemini, vLLM (local) |
| **RAG** | LlamaIndex, Docling, PyMuPDF |
| **TTS** | OpenAI TTS, configurable voice & model |
| **Search** | Perplexity, Tavily, Serper, Jina, Exa |
| **Vector Store** | Local (LlamaIndex) / Azure AI Search |
| **Container** | Docker, Docker Compose |
| **Linting** | Ruff, Black, MyPy, Bandit |
| **Testing** | Pytest, Playwright (E2E) |

---

## 🔧 Development Tools

```bash
# Code formatting
black src/

# Linting
ruff check src/

# Type checking
mypy src/

# Run tests
pytest tests/

# Security scan
bandit -r src/

# Audit prompts integrity
python scripts/audit_prompts.py
```

---

## 🤝 Community & Support

| Channel | Link |
|:---|:---|
| 💬 Discord | [Join our server](https://discord.gg/eRsjPgMU4t) |
| 🐙 GitHub Discussions | [Ask & discuss](https://github.com/learningBix/bixy_AiTutor/discussions) |
| 📖 License | [Apache 2.0](https://opensource.org/licenses/Apache-2.0) |

---
<div align="center">
  <sub>Developed with ❤️ by <b>LearningBix</b> | Empowering Indian students with AI-first education</sub>
</div>
