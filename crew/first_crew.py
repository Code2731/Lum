"""
첫 crew — 단일 에이전트로 LUM의 Fast Track(TabbyAPI :5000) 동작 검증.

실행 전 점검:
1. LUM 켜져있고 좌상단 xLLM ● 초록불
2. ModelManager에서 코딩 모델 [사용] 클릭됨 (loaded_model이 Empty Model 아님)
3. cp .env.example .env 후 TABBY_API_KEY 채움
"""
from crewai import Agent, Task, Crew, Process
from lum_llm import make_llm

fast = make_llm("fast")

coder = Agent(
    role="시니어 Python 개발자",
    goal="요청받은 함수를 정확히 구현하고 docstring + 타입 힌트 포함",
    backstory="10년 경력 백엔드 개발자. PEP 8 / 타입 힌트 / 명확한 에러 처리를 중시한다.",
    llm=fast,
    verbose=True,
)

task = Task(
    description=(
        "Python 함수를 작성해줘:\n"
        "- 이름: parse_lum_log\n"
        "- 입력: log_text (str) — TabbyAPI 또는 mistral.rs 로그 한 덩어리\n"
        "- 출력: list[dict] — 각 dict는 {timestamp, level, message}\n"
        "- ERROR/WARN/INFO 레벨 추출 (정규식 사용)\n"
        "- 빈 줄과 매칭 안 되는 줄은 무시\n"
        "코드만 출력 (설명 X). docstring + 타입 힌트 필수."
    ),
    agent=coder,
    expected_output="실행 가능한 Python 함수 코드 한 덩어리",
)

if __name__ == "__main__":
    crew = Crew(agents=[coder], tasks=[task], process=Process.sequential, verbose=True)
    result = crew.kickoff()
    print("\n" + "=" * 60)
    print("결과:")
    print("=" * 60)
    print(result)
