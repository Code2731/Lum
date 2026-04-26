# Lum-Crew — CrewAI + LUM 로컬 LLM

LUM의 두 엔진(TabbyAPI Fast / mistral.rs Heavy)을 활용하는 별도 Python 프로젝트.
LUM 본체와 분리되어 있어 CrewAI 업데이트를 자유롭게 따라갈 수 있다.

## 셋업

```bash
cd J:/MyProject/Lum/crew
python -m venv .venv
.venv/Scripts/activate          # Windows (Bash: source .venv/Scripts/activate)
pip install -r requirements.txt
cp .env.example .env            # .env 열어 ${YOUR_TABBY_API_KEY} 자리에 실제 키 입력
```

> `.env`는 `.gitignore` 처리됨. **절대 commit 하지 말 것** (API 키 노출).

## 실행

먼저 LUM에서 사용할 엔진 시작:
- Fast: XllmPanel → TabbyAPI [시작] + 모델 [사용]
- Heavy: XllmPanel Heavy 섹션 → [실행]

그 다음:
```bash
.venv/Scripts/python.exe first_crew.py          # 단일 에이전트 (Fast)
.venv/Scripts/python.exe dual_engine_crew.py    # 3-agent 협업 (모두 Fast)
.venv/Scripts/python.exe heavy_single_demo.py   # Heavy 단발 호출
```

## 엔진 매핑 원칙 (lessons learned)

CrewAI multi-agent 통합 검증 끝에 도출된 규칙:

| 사용 패턴 | 엔진 | 이유 |
|---|---|---|
| **CrewAI multi-agent** (Planner/Coder/Reviewer 등) | **Fast (TabbyAPI)** | agent 응답이 다음 단계 입력으로 흐르므로 *예측 가능한 응답 시간* 필수. EXL2 12-16 tok/s. |
| **단발 깊은 추론** (시간복잡도 분석, 알고리즘 비교 등) | **Heavy (mistral.rs)** | thinking 모델의 강점. 한 번에 한 질문 → 깊은 답. |

**Heavy를 CrewAI agent에 직접 박는 건 부적합**:
- thinking 모델은 reasoning 토큰을 길게 토해냄 → 컨텍스트 누적 시 1 tok/s로 마비
- LiteLLM 600s timeout 초과 → CrewAI 자동 retry → mistral.rs 큐 폭발 (`6 waiting` 등)
- RTX 3080 10GB + Q4K 환경에서 검증된 한계 — 더 큰 GPU에선 다를 수 있음

## 파일 구성

| 파일 | 엔진 | 역할 |
|---|---|---|
| `lum_llm.py` | — | 공통 헬퍼 — `make_llm("fast"\|"heavy")`, UTF-8 부트스트랩, env 가드, timeout |
| `first_crew.py` | Fast | 단일 에이전트 hello world |
| `dual_engine_crew.py` | Fast×3 | 3-agent sequential 협업 (Planner→Coder→Reviewer) |
| `heavy_single_demo.py` | Heavy | Heavy 단발 호출 — 시간 복잡도 분석 |
| `lum_mcp_crew.py` | Fast | LUM-MCP × CrewAI — `lum-mcp-server.exe` stdio 연결 + 7개 도구 자동 호출 (Phase 82c) |

새 crew 추가 시 `from lum_llm import make_llm` 한 줄로 두 엔진에 즉시 접속.

## 다음 단계

- [x] **LUM-MCP-server (Phase 82a/b/c)** — `src-tauri/src/bin/mcp_server.rs` 별도 binary로
      LUM 자체 도구 7개(read_file / read_file_lines / list_directory / git_diff /
      apply_edit_block / get_repo_map / run_tests) stdio MCP 노출. `lum_mcp_crew.py`에서
      MCPServerAdapter로 spawn해 CrewAI Agent에 자동 노출 — *진짜 자율 코딩의 토대*.
- [ ] **AOS Shared Context Server (Phase 83)** — 중앙 집중형 컨텍스트 서버 + 우선순위
      스케줄러 (Rust 네이티브). 여러 에이전트의 RAG 중복 제거 + 토큰/메모리 절감.
- [ ] CrewAI YAML 패턴(`@CrewBase` + `config/agents.yaml` + `config/tasks.yaml`) — 3개 이상의
      crew가 생기면 imperative 대신 declarative로 전환
