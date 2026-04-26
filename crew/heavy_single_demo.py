"""
Heavy 단발 호출 시연 — mistral.rs(Qwen3-8B thinking)의 강점인 깊은 reasoning을
*짧은 입력 + 단일 응답*으로 활용.

CrewAI multi-agent에 박지 않는 이유 (lessons learned):
- CrewAI는 agent 응답을 다음 단계로 흘리는 파이프라인 → 예측 가능한 응답 시간 필요
- Heavy thinking은 reasoning 토큰을 길게 토해내고 컨텍스트 길어지면 1 tok/s로 마비
- 결과: timeout → auto retry → 큐 폭발

따라서 Heavy는 단일 LLM.call() 형태로 *한 번에 한 질문* 사용이 정답.
"""
from lum_llm import make_llm, TEMP_REASONING

heavy = make_llm("heavy", temperature=TEMP_REASONING)

QUESTION = (
    "다음 Python 코드의 시간 복잡도를 분석하고, n=1_000_000일 때 실행 시간을 추정해줘. "
    "결과는 (1) Big-O, (2) 추정 실행 시간, (3) 더 빠른 대안 한 줄로:\n\n"
    "```python\n"
    "def find_pairs(arr, target):\n"
    "    pairs = []\n"
    "    for i in range(len(arr)):\n"
    "        for j in range(i+1, len(arr)):\n"
    "            if arr[i] + arr[j] == target:\n"
    "                pairs.append((arr[i], arr[j]))\n"
    "    return pairs\n"
    "```"
)

if __name__ == "__main__":
    print("=" * 70)
    print("Heavy 단발 호출 — Qwen3-8B thinking으로 시간 복잡도 분석")
    print("=" * 70)
    response = heavy.call([{"role": "user", "content": QUESTION}])
    print("\n응답:\n")
    print(response)
