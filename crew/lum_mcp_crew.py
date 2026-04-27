"""
Phase 82c — CrewAI ↔ lum-mcp-server 연결 검증.

MCPServerAdapter가 lum-mcp-server.exe를 stdio MCP client로 spawn,
7개 도구(read_file / list_directory / git_diff / apply_edit_block / get_repo_map /
read_file_lines / run_tests)를 CrewAI Agent의 tools로 노출.

자연어 명령 한 줄 → LLM이 자동으로 적절한 도구 호출 → 결과 받음 → 다음 행동
(ReAct 루프). LUM 프로젝트의 *진짜 자율 코딩* 첫 시연.

전제:
- LUM 빌드 됨: `cargo build --bin lum-mcp-server` (target/debug/lum-mcp-server.exe)
- LUM TabbyAPI Fast Track 동작 (좌상단 xLLM ● 초록)
"""
from pathlib import Path
from crewai import Agent, Task, Crew, Process
from crewai_tools import MCPServerAdapter
from mcp import StdioServerParameters

from lum_llm import make_llm, TEMP_CODE

LUM_PROJECT_ROOT = Path(__file__).parent.parent
LUM_MCP_BIN = LUM_PROJECT_ROOT / "src-tauri" / "target" / "debug" / "lum-mcp-server.exe"

if not LUM_MCP_BIN.exists():
    raise SystemExit(
        f"lum-mcp-server.exe 없음: {LUM_MCP_BIN}\n"
        "먼저 빌드: cd src-tauri && cargo build --bin lum-mcp-server"
    )

server_params = StdioServerParameters(
    command=str(LUM_MCP_BIN),
    args=[],
    env=None,
)

fast = make_llm("fast", temperature=TEMP_CODE)

USER_REQUEST = (
    f"`{LUM_PROJECT_ROOT}` 폴더의 파일 목록을 list_directory 도구로 조회하고, "
    "결과 그대로 한국어 한 줄로 요약. 코드 작성 금지, 도구 호출만."
)

if __name__ == "__main__":
    print("=" * 70)
    print("LUM-MCP × CrewAI — 자연어 → AI가 도구 자동 호출 (Phase 82c)")
    print("=" * 70)

    with MCPServerAdapter(server_params) as tools:
        tool_names = [getattr(t, "name", "?") for t in tools]
        print(f"\nlum-mcp-server에서 받은 도구 ({len(tool_names)}): {tool_names}\n")

        explorer = Agent(
            role="LUM 프로젝트 탐색 에이전트",
            goal="LUM-MCP 도구로 파일·디렉토리·git을 직접 조회하고 결과를 요약",
            backstory=(
                "LUM 프로젝트의 자체 도구(read_file / list_directory / git_diff 등)에 "
                "stdio MCP로 직접 접근하는 분석 에이전트. "
                "절대 규칙: Python 코드를 작성하지 않는다. import 하지 않는다. "
                "오직 제공된 tool을 함수 호출(function calling)로 직접 부른다. "
                "도구 결과를 받기 전에는 어떤 답도 추측하지 않는다."
            ),
            llm=fast,
            tools=list(tools),
            verbose=True,
        )

        task = Task(
            description=USER_REQUEST,
            agent=explorer,
            expected_output="LUM commands 폴더 파일 목록 + 현재 변경분 요약 (3~5줄 한국어).",
        )

        crew = Crew(
            agents=[explorer],
            tasks=[task],
            process=Process.sequential,
            verbose=True,
        )
        result = crew.kickoff()

        print("\n" + "=" * 70)
        print("최종 결과:")
        print("=" * 70)
        print(result)
