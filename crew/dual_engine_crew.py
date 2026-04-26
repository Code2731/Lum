"""
Multi-agent Crew — Planner → Coder → Reviewer 순차 협업.

엔진 매핑 원칙 (lessons learned):
- CrewAI multi-agent에는 모두 Fast(TabbyAPI EXL2)가 정답.
  agent 응답이 다음 단계 입력으로 흐르므로 *예측 가능한 응답 시간*이 필수.
- Heavy(mistral.rs Qwen3-8B thinking)는 RTX 3080 10GB + Q4K + 긴 컨텍스트에서
  1 tok/s로 마비 → CrewAI auto-retry가 큐를 폭발시킴. 단발 호출용으로만.
  Heavy 단발 시연은 heavy_single_demo.py 참고.
"""
from crewai import Agent, Task, Crew, Process
from lum_llm import make_llm, TEMP_CODE, TEMP_DEFAULT

# 모든 에이전트 Fast — 역할별로 temperature만 다르게.
fast_code = make_llm("fast", temperature=TEMP_CODE)        # 코드는 결정적이게
fast_default = make_llm("fast", temperature=TEMP_DEFAULT)  # 계획·리뷰는 약간 발산적이게

planner = Agent(
    role="시니어 소프트웨어 설계자",
    goal="요청을 분석해 명확한 구현 계획(3~5단계)을 수립",
    backstory=(
        "복잡한 요구사항을 먼저 작은 단위로 쪼개고, 각 단계의 검증 가능한 출력을 "
        "정의한 뒤 코더에게 넘기는 것이 신조."
    ),
    llm=fast_default,
    verbose=True,
)

coder = Agent(
    role="시니어 Python 개발자",
    goal="계획대로 정확한 코드를 작성하되 타입 힌트·docstring·예외 처리 포함",
    backstory=(
        "10년 경력 백엔드 개발자. PEP 8을 지키고 명확한 에러 메시지를 중시한다. "
        "계획에 명시된 단계를 빠뜨리지 않는다."
    ),
    llm=fast_code,
    verbose=True,
)

reviewer = Agent(
    role="시니어 코드 리뷰어",
    goal="코드의 정확성·엣지케이스·보안 이슈를 지적하고 구체적 개선안을 제시",
    backstory=(
        "OWASP Top 10 + Pythonic 원칙에 정통. 단순 칭찬보다 *구체적이고 실행 가능한* "
        "개선안을 짧게 제시한다. 발견 없으면 '발견 없음 — 코드 정상' 한 줄."
    ),
    llm=fast_default,
    verbose=True,
)

USER_REQUEST = (
    "Python 데코레이터 `@track_latency`를 작성. 요구사항:\n"
    "- 동기/비동기 함수 둘 다 지원 (async def 자동 감지)\n"
    "- 호출 횟수, 평균/p50/p95 latency를 누적 추적\n"
    "- `track_latency.stats(name)` 메서드로 통계 dict 조회\n"
    "- 스레드/태스크 안전 (threading.Lock)\n"
    "- 의존성: 표준 라이브러리만 (statistics, time, asyncio, functools, threading)"
)

plan_task = Task(
    description=f"다음 요청에 대한 구현 계획을 수립:\n\n{USER_REQUEST}\n\n3~5단계로 쪼개고, 각 단계 출력을 명시.",
    agent=planner,
    expected_output="3~5단계 번호 매겨진 계획 (각 단계: 무엇을 / 어떤 검증).",
)

code_task = Task(
    description="앞 계획의 모든 단계를 충실히 구현. 코드 한 덩어리로 출력 (설명 X).",
    agent=coder,
    expected_output="실행 가능한 Python 코드 — 데코레이터 + stats 메서드 포함.",
    context=[plan_task],
)

review_task = Task(
    description=(
        "앞 코드를 정확성·엣지케이스·보안 관점에서 리뷰. "
        "지적은 *구체적이고 실행 가능한 개선안* 형태로. "
        "지적이 없으면 '발견 없음 — 코드 정상' 한 줄."
    ),
    agent=reviewer,
    expected_output="리뷰 결과 (발견된 이슈 목록 또는 '발견 없음' 한 줄).",
    context=[plan_task, code_task],
)

if __name__ == "__main__":
    crew = Crew(
        agents=[planner, coder, reviewer],
        tasks=[plan_task, code_task, review_task],
        process=Process.sequential,
        verbose=True,
    )
    print("=" * 70)
    print("Multi-agent Crew 시작 — Planner → Coder → Reviewer (모두 Fast)")
    print("=" * 70)
    result = crew.kickoff()
    print("\n" + "=" * 70)
    print("최종 결과 (리뷰 단계 출력):")
    print("=" * 70)
    print(result)
