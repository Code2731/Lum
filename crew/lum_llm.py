"""
LUM dual engine을 CrewAI LLM으로 감싸는 공통 헬퍼.

import 시점 부수효과:
- Windows cp949 → utf-8 stdout/stderr 재구성 (한국어/이모지 출력 깨짐 방지)
- .env 로드

이 모듈을 import만 하면 first_crew.py / dual_engine_crew.py 모두 동일한 부트스트랩 적용.
"""
import os
import sys
from typing import Literal

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from crewai import LLM

load_dotenv()

# OpenAI 호환 self-hosted endpoint(TabbyAPI/mistral.rs)용 native provider prefix.
# `openai/` prefix를 쓰면 LiteLLM 폴백이 필요해서 의존성 무거워짐.
HOSTED_VLLM_PREFIX = "hosted_vllm/"

# 트랙별 권장 temperature — 코드는 결정적이게, 추론·검토는 약간 발산적이게.
TEMP_CODE = 0.2
TEMP_DEFAULT = 0.3
TEMP_REASONING = 0.4

# 트랙별 timeout — Heavy(mistral.rs)는 thinking 토큰으로 더 오래 걸림.
TIMEOUT_FAST_SEC = 120
TIMEOUT_HEAVY_SEC = 300

Track = Literal["fast", "heavy"]


def require_env(name: str) -> str:
    """누락 시 KeyError 대신 명확한 안내로 종료."""
    val = os.environ.get(name)
    if not val:
        sys.exit(f"환경변수 {name} 누락 — `cp .env.example .env` 후 값 채우세요.")
    return val


def make_llm(track: Track, *, temperature: float = TEMP_DEFAULT) -> LLM:
    """LUM 두 엔진 중 하나를 CrewAI LLM 객체로 반환.

    - "fast": TabbyAPI :5000 (TABBY_* 환경변수 사용, timeout 120s)
    - "heavy": mistral.rs :8080 (MISTRAL_* 환경변수 사용, timeout 300s)
    """
    if track == "fast":
        prefix, model_var, base_var, key_var = "TABBY", "TABBY_MODEL", "TABBY_BASE_URL", "TABBY_API_KEY"
        timeout = TIMEOUT_FAST_SEC
    else:
        prefix, model_var, base_var, key_var = "MISTRAL", "MISTRAL_MODEL", "MISTRAL_BASE_URL", "MISTRAL_API_KEY"
        timeout = TIMEOUT_HEAVY_SEC
    _ = prefix  # 추후 prefix 기반 확장용 명시
    return LLM(
        model=f"{HOSTED_VLLM_PREFIX}{require_env(model_var)}",
        base_url=require_env(base_var),
        api_key=require_env(key_var),
        temperature=temperature,
        timeout=timeout,
    )
