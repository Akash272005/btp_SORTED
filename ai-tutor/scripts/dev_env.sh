#!/usr/bin/env bash
# Source this file to use the project-local Python 3.11 venv and Node.js:
#   source scripts/dev_env.sh
# Or from project root:
#   source activate

if [[ -n "${ZSH_VERSION:-}" ]]; then
  _DEV_ENV_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
  _DEV_ENV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
ROOT="$(cd "${_DEV_ENV_DIR}/.." && pwd)"

export PATH="${ROOT}/.venv/bin:${ROOT}/.tools/node/bin:${PATH}"

if [[ -f "${ROOT}/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "${ROOT}/.venv/bin/activate"
fi

if command -v python >/dev/null 2>&1; then
  echo "bixy_AiTutor env: $(python --version) at $(command -v python)"
elif [[ -x "${ROOT}/.venv/bin/python" ]]; then
  export PATH="${ROOT}/.venv/bin:${PATH}"
  echo "bixy_AiTutor env: $("${ROOT}/.venv/bin/python" --version) at ${ROOT}/.venv/bin/python"
else
  echo "bixy_AiTutor env: Python venv missing at ${ROOT}/.venv" >&2
  echo "  Run: ${ROOT}/.tools/python311/bin/python3 -m venv ${ROOT}/.venv && source activate && pip install -r requirements.txt" >&2
fi
