import { describe, it, expect } from "vitest";
import { routeInput, detectCodingIntent } from "./inputRouter";

describe("routeInput — 기본: 자연어=AI, CLI 감지 시 shell", () => {
  it("빈 입력 → empty", () => {
    expect(routeInput("")).toEqual({ type: "empty" });
    expect(routeInput("   ")).toEqual({ type: "empty" });
  });

  describe("shell fast-path — 알려진 CLI 토큰", () => {
    it("ls → shell", () => {
      expect(routeInput("ls -la")).toEqual({ type: "shell", command: "ls -la" });
    });
    it("git status → shell", () => {
      expect(routeInput("git status")).toEqual({ type: "shell", command: "git status" });
    });
    it("cd ~/docs → shell", () => {
      expect(routeInput("cd ~/docs")).toEqual({ type: "shell", command: "cd ~/docs" });
    });
    it("npm install → shell", () => {
      expect(routeInput("npm install")).toEqual({ type: "shell", command: "npm install" });
    });
    it("docker ps → shell", () => {
      expect(routeInput("docker ps")).toEqual({ type: "shell", command: "docker ps" });
    });
    it("echo hello → shell", () => {
      expect(routeInput("echo hello")).toEqual({ type: "shell", command: "echo hello" });
    });
    it("node script.js → shell", () => {
      expect(routeInput("node script.js")).toEqual({ type: "shell", command: "node script.js" });
    });
    it("patch file.diff → shell", () => {
      expect(routeInput("patch file.diff")).toEqual({ type: "shell", command: "patch file.diff" });
    });
  });

  describe("shell fast-path — 경로/특수문자 시작", () => {
    it("/usr/bin/env → shell", () => {
      expect(routeInput("/usr/bin/env")).toEqual({ type: "shell", command: "/usr/bin/env" });
    });
    it("./run.sh → shell", () => {
      expect(routeInput("./run.sh")).toEqual({ type: "shell", command: "./run.sh" });
    });
    it("~/bin/mycli → shell", () => {
      expect(routeInput("~/bin/mycli")).toEqual({ type: "shell", command: "~/bin/mycli" });
    });
    it("파이프로 시작 → shell", () => {
      expect(routeInput("| grep foo")).toEqual({ type: "shell", command: "| grep foo" });
    });
    it("환경변수 prefix → shell (NODE_ENV=production node server.js)", () => {
      expect(routeInput("NODE_ENV=production node server.js")).toEqual({
        type: "shell",
        command: "NODE_ENV=production node server.js",
      });
    });
  });

  describe("AI default — 자연어", () => {
    it("한국어 자연어 → ai", () => {
      expect(routeInput("현재 디렉토리 파일 개수 세줘")).toEqual({
        type: "ai",
        question: "현재 디렉토리 파일 개수 세줘",
      });
    });
    it("영어 자연어 → ai", () => {
      expect(routeInput("how do I rebase onto main?")).toEqual({
        type: "ai",
        question: "how do I rebase onto main?",
      });
    });
    it("모르는 첫 토큰 → ai", () => {
      expect(routeInput("foobar baz")).toEqual({
        type: "ai",
        question: "foobar baz",
      });
    });
  });

  describe("명시적 prefix 보존", () => {
    it("명시적 prefix 뒤 유니코드 공백도 동작", () => {
      expect(routeInput(">>\u2009이 프로젝트 빌드해줘")).toEqual({
        type: "agent",
        task: "이 프로젝트 빌드해줘",
      });
      expect(routeInput("#\u2003파일 개수 세줘")).toEqual({
        type: "aiCmd",
        prompt: "파일 개수 세줘",
      });
      expect(routeInput("?\u205Fgit rebase")).toEqual({
        type: "explain",
        command: "git rebase",
      });
      expect(routeInput("#\r\n파일 개수 세줘")).toEqual({
        type: "aiCmd",
        prompt: "파일 개수 세줘",
      });
      expect(routeInput("?\ngit rebase")).toEqual({
        type: "explain",
        command: "git rebase",
      });
      expect(routeInput("!!\u00A0요약해줘")).toEqual({
        type: "heavy",
        prompt: "요약해줘",
      });
      expect(routeInput("!\u2002ls -la")).toEqual({
        type: "shell",
        command: "ls -la",
      });
      expect(routeInput("#\u205F")).toEqual({
        type: "aiCmd",
        prompt: "",
      });
      expect(routeInput("?\u2002")).toEqual({
        type: "explain",
        command: "",
      });
      expect(routeInput("!\u3000git status")).toEqual({
        type: "shell",
        command: "git status",
      });
    });

    it(">> 에이전트 태스크", () => {
      expect(routeInput(">> 이 프로젝트 빌드해줘")).toEqual({
        type: "agent",
        task: "이 프로젝트 빌드해줘",
      });
    });
    it(">> (공백 없이)", () => {
      expect(routeInput(">>hello")).toEqual({ type: "agent", task: "hello" });
    });
    it("# AI 명령어 제안", () => {
      expect(routeInput("# 파일 개수 세줘")).toEqual({
        type: "aiCmd",
        prompt: "파일 개수 세줘",
      });
    });
    it("#/? 뒤 탭도 prefix 구분자로 인식", () => {
      expect(routeInput("#\t파일 개수 세줘")).toEqual({
        type: "aiCmd",
        prompt: "파일 개수 세줘",
      });
      expect(routeInput("?\tgit rebase")).toEqual({
        type: "explain",
        command: "git rebase",
      });
    });
    it("? 명령어 설명", () => {
      expect(routeInput("? git rebase")).toEqual({
        type: "explain",
        command: "git rebase",
      });
    });
  });

  describe("override", () => {
    it("! → 강제 shell (자연어 라도)", () => {
      expect(routeInput("!foobar baz")).toEqual({
        type: "shell",
        command: "foobar baz",
      });
    });
    it("! 단독 입력은 empty로 처리", () => {
      expect(routeInput("!")).toEqual({ type: "empty" });
      expect(routeInput("!   ")).toEqual({ type: "empty" });
    });
  it("@ → 강제 AI (CLI 이름이라도)", () => {
      expect(routeInput("@ls 왜 에러나는지 알려줘")).toEqual({
        type: "ai",
        question: "ls 왜 에러나는지 알려줘",
      });
    });
    it("@ 단독 입력은 empty로 처리", () => {
      expect(routeInput("@")).toEqual({ type: "empty" });
      expect(routeInput("@   ")).toEqual({ type: "empty" });
      expect(routeInput("@\r")).toEqual({ type: "empty" });
      expect(routeInput("\r@")).toEqual({ type: "empty" });
      expect(routeInput(" \t@ ")).toEqual({ type: "empty" });
    });
  });

  describe("경계 케이스", () => {
    it("앞뒤 공백 제거", () => {
      expect(routeInput("   ls   ")).toEqual({ type: "shell", command: "ls" });
    });
    it("단일 단어 CLI", () => {
      expect(routeInput("pwd")).toEqual({ type: "shell", command: "pwd" });
    });
    it("단일 한국어 단어 → ai", () => {
      expect(routeInput("안녕")).toEqual({ type: "ai", question: "안녕" });
    });
  });

  // ─── 자연어 코딩 의도 자동 라우팅 ─────────────────────────────────────────
  describe("자연어 코딩 의도 → agent", () => {
    const agentCases = [
      // 한국어 — 동사 + 명사
      "utils.ts에 add 함수 추가해줘",
      "함수 추가해",
      "로그인 버그 고쳐줘",
      "이 함수에 테스트 작성",
      "Button 컴포넌트 리팩터링해",
      "리팩터링하자",
      "이 코드 수정해줘",
      // 영어 — 동사 + 명사 (단/복수 포함)
      "add a function to compute sum",
      "added a function in auth module",
      "fix the bug in login flow",
      "fix this bug",
      "resolve the login issue",
      "patch the auth issue",
      "refactor this module to use hooks",
      "write tests for the parser",
      "rename the class from Foo to Bar",
    ];
    it.each(agentCases)("'%s' → agent", (input) => {
      expect(routeInput(input)).toEqual({ type: "agent", task: input });
    });

    const aiCases = [
      "이 코드 어떻게 동작해?",   // 명사 ✓ 동사 ✗ → ai
      "이 함수 설명해줘",         // 명사 ✓ 코딩 동사 ✗
      "how do I rebase onto main?", // 동사·명사 ✗
      "what is a closure",        // 코딩 동사·명사 ✗
      "오늘 날씨 어때",            // 둘 다 ✗
    ];
    it.each(aiCases)("'%s' → ai (코딩 의도 미매치)", (input) => {
      expect(routeInput(input)).toEqual({ type: "ai", question: input });
    });

    it.each([
      "최근 거부 케이스 3개 보여줘",
      "실패 패턴 요약해줘",
      "내가 거부한 자동치유 제안 보여줘",
      "show my rejected healing cases",
    ])("healing 조회 의도 '%s' → agent", (input) => {
      expect(routeInput(input)).toEqual({ type: "agent", task: input });
    });

    it.each([
      "프로젝트 리뷰 해줘",
      "코드 리뷰 해줘",
      "이 프로젝트 문제점 리뷰해줘",
      "review this project",
      "code review this repo",
    ])("코드/프로젝트 리뷰 의도 '%s' → agent", (input) => {
      expect(routeInput(input)).toEqual({ type: "agent", task: input });
    });

    describe("우선순위 — 명시적 prefix 우선", () => {
      it("@ override는 코딩 의도 있어도 ai로", () => {
        // "@ 코드 추가해" — 코딩 의도지만 사용자가 명시적으로 ai 요청.
        expect(routeInput("@ 이 코드 수정해줘 어떻게 하면 돼")).toEqual({
          type: "ai",
          question: "이 코드 수정해줘 어떻게 하면 돼",
        });
      });
      it(">> prefix는 그대로 agent (의도 분류 거치지 않음)", () => {
        expect(routeInput(">> 그냥 빌드만 돌려")).toEqual({
          type: "agent",
          task: "그냥 빌드만 돌려",
        });
      });
      it("셸 명령은 코딩 키워드 있어도 shell 우선", () => {
        // 'git add file' — 'add'/'file'이 코딩 키워드지만 git이 셸이라 shell.
        expect(routeInput("git add file.txt")).toEqual({
          type: "shell",
          command: "git add file.txt",
        });
      });
    });
  });

  // ─── 백엔드 강제 prefix (Phase 125) ───────────────────────────────────────
  describe("@<backend> prefix — AI 백엔드 강제", () => {
    it("@local 코딩 의도 → agent + backend=local", () => {
      expect(routeInput("@local utils.ts에 add 함수 추가해줘")).toEqual({
        type: "agent",
        task: "utils.ts에 add 함수 추가해줘",
        backend: "local",
      });
    });

    it("@local 리뷰 의도 → agent + backend=local", () => {
      expect(routeInput("@local 프로젝트 리뷰 해줘")).toEqual({
        type: "agent",
        task: "프로젝트 리뷰 해줘",
        backend: "local",
      });
    });

    it("@local + patch issue → agent + backend=local", () => {
      expect(routeInput("@local patch the auth issue")).toEqual({
        type: "agent",
        task: "patch the auth issue",
        backend: "local",
      });
    });

    it("@backend + >> 조합은 강제 agent로 처리", () => {
      expect(routeInput("@local >> 테스트 실패 원인 찾아서 고쳐줘")).toEqual({
        type: "agent",
        task: "테스트 실패 원인 찾아서 고쳐줘",
        backend: "local",
      });
    });

    it("@embedded는 @local과 동일 alias", () => {
      expect(routeInput("@embedded 코드 수정해줘")).toEqual({
        type: "agent",
        task: "코드 수정해줘",
        backend: "local",
      });
    });

    it("@sglang는 xllm 강제와 동일하게 동작", () => {
      expect(routeInput("@sglang what is a closure?")).toEqual({
        type: "ai",
        question: "what is a closure?",
        backend: "xllm",
      });
    });

    it("@sglang + patch issue → agent + backend=xllm", () => {
      expect(routeInput("@sglang patch the auth issue")).toEqual({
        type: "agent",
        task: "patch the auth issue",
        backend: "xllm",
      });
    });

    it("@ollama 일반 질문 → ai + backend=ollama", () => {
      expect(routeInput("@ollama 이 코드 어떻게 동작해?")).toEqual({
        type: "ai",
        question: "이 코드 어떻게 동작해?",
        backend: "ollama",
      });
    });

    it("@gemini 코딩 의도 → agent + backend=gemini", () => {
      expect(routeInput("@gemini fix the bug in login flow")).toEqual({
        type: "agent",
        task: "fix the bug in login flow",
        backend: "gemini",
      });
    });

    it("@xllm 일반 질문 → ai + backend=xllm", () => {
      expect(routeInput("@xllm what is a closure?")).toEqual({
        type: "ai",
        question: "what is a closure?",
        backend: "xllm",
      });
    });

    it("@cloud는 @gemini의 alias", () => {
      expect(routeInput("@cloud explain this")).toEqual({
        type: "ai",
        question: "explain this",
        backend: "gemini",
      });
    });

    it("@backend 뒤 탭/개행 구분자도 backend 강제로 인식", () => {
      expect(routeInput("@local\tfix the bug in login flow")).toEqual({
        type: "agent",
        task: "fix the bug in login flow",
        backend: "local",
      });
      expect(routeInput("@cloud\nexplain this")).toEqual({
        type: "ai",
        question: "explain this",
        backend: "gemini",
      });
      expect(routeInput("\r@xllm\tresolve this")).toEqual({
        type: "agent",
        task: "resolve this",
        backend: "xllm",
      });
      expect(routeInput("\r\n@Cloud\r\nexplain this")).toEqual({
        type: "ai",
        question: "explain this",
        backend: "gemini",
      });
      expect(routeInput("@cloud\u00A0explain this")).toEqual({
        type: "ai",
        question: "explain this",
        backend: "gemini",
      });
      expect(routeInput("\u00A0@local hi")).toEqual({
        type: "agent",
        task: "hi",
        backend: "local",
      });
      expect(routeInput("\u2003@xllm hi")).toEqual({
        type: "agent",
        task: "hi",
        backend: "xllm",
      });
      expect(routeInput("@cloud\u2002hi")).toEqual({
        type: "ai",
        question: "hi",
        backend: "gemini",
      });
      expect(routeInput("@xllm\u2009hi")).toEqual({
        type: "agent",
        task: "hi",
        backend: "xllm",
      });
      expect(routeInput("@cloud\u205Fhi")).toEqual({
        type: "ai",
        question: "hi",
        backend: "gemini",
      });
      expect(routeInput("@local\u3000hi")).toEqual({
        type: "agent",
        task: "hi",
        backend: "local",
      });
      expect(routeInput("\u2002@ollama hi")).toEqual({
        type: "agent",
        task: "hi",
        backend: "ollama",
      });
      expect(routeInput("\u3000@cloud hi")).toEqual({
        type: "ai",
        question: "hi",
        backend: "gemini",
      });
    });

    it("@와 backend 사이 공백이 있어도 backend 강제로 인식", () => {
      expect(routeInput("@ local fix the bug in login flow")).toEqual({
        type: "agent",
        task: "fix the bug in login flow",
        backend: "local",
      });
      expect(routeInput("@   xllm what is a closure?")).toEqual({
        type: "ai",
        question: "what is a closure?",
        backend: "xllm",
      });
      expect(routeInput("   @ embedded")).toEqual({ type: "empty" });
    });

    it("@backend + 탭/개행 뒤 >> 조합도 강제 agent 유지", () => {
      expect(routeInput("@local\t>> 테스트 실패 원인 찾아서 고쳐줘")).toEqual({
        type: "agent",
        task: "테스트 실패 원인 찾아서 고쳐줘",
        backend: "local",
      });
      expect(routeInput("@xllm\n>> resolve the parse error")).toEqual({
        type: "agent",
        task: "resolve the parse error",
        backend: "xllm",
      });
      expect(routeInput("@cloud\t>> 로그 분석 해줘")).toEqual({
        type: "agent",
        task: "로그 분석 해줘",
        backend: "gemini",
      });
    });

    it("@backend 단독/본문 분리 구분에서 CR/LF/유니코드 공백 경계가 일관되게 처리된다", () => {
      expect(routeInput("@local\r\nresolve the auth issue")).toEqual({
        type: "agent",
        task: "resolve the auth issue",
        backend: "local",
      });
      expect(routeInput("@xllm\u205Ffix this bug")).toEqual({
        type: "agent",
        task: "fix this bug",
        backend: "xllm",
      });
      expect(routeInput("@cloud\u3000")).toEqual({ type: "empty" });
    });

    it("@backend + >> 뒤 공백만 있으면 empty", () => {
      expect(routeInput("@local >>")).toEqual({ type: "empty" });
      expect(routeInput("@local\t>>")).toEqual({ type: "empty" });
      expect(routeInput("@xllm\n>>   ")).toEqual({ type: "empty" });
      expect(routeInput("@cloud\n>>\t")).toEqual({ type: "empty" });
      expect(routeInput("@OLLAMA  >>\t   ")).toEqual({ type: "empty" });
    });

    it("@backend 단독 입력은 앞뒤 공백/탭이 있어도 empty", () => {
      expect(routeInput("   @local   ")).toEqual({ type: "empty" });
      expect(routeInput("@xllm\u00A0")).toEqual({ type: "empty" });
      expect(routeInput("\t@xllm\t")).toEqual({ type: "empty" });
      expect(routeInput("\n@ollama\n")).toEqual({ type: "empty" });
      expect(routeInput("  @gemini   ")).toEqual({ type: "empty" });
      expect(routeInput("   @cloud   ")).toEqual({ type: "empty" });
      expect(routeInput("  @embedded \t")).toEqual({ type: "empty" });
      expect(routeInput("\n\t@xllm\n")).toEqual({ type: "empty" });
      expect(routeInput("\t\n@Cloud   ")).toEqual({ type: "empty" });
      expect(routeInput("\r@xllm\r")).toEqual({ type: "empty" });
      expect(routeInput("\r\n@Cloud\r\n")).toEqual({ type: "empty" });
    });

    it("@local만 단독 입력 → 빈 입력(backend만 토글)", () => {
      expect(routeInput("@local")).toEqual({ type: "empty" });
      expect(routeInput("@local\t")).toEqual({ type: "empty" });
      expect(routeInput("@local\n")).toEqual({ type: "empty" });
    });

    it("@ollama만 단독 입력 → 빈 입력(backend만 토글)", () => {
      expect(routeInput("@ollama")).toEqual({ type: "empty" });
      expect(routeInput("@ollama\t")).toEqual({ type: "empty" });
      expect(routeInput("@ollama\n")).toEqual({ type: "empty" });
    });

    it("@xllm만 단독 입력 → 빈 입력(backend만 토글)", () => {
      expect(routeInput("@xllm")).toEqual({ type: "empty" });
      expect(routeInput("@xllm\t")).toEqual({ type: "empty" });
      expect(routeInput("@xllm\n")).toEqual({ type: "empty" });
    });

    it("@gemini만 단독 입력 → 빈 입력(backend만 토글)", () => {
      expect(routeInput("@gemini")).toEqual({ type: "empty" });
      expect(routeInput("@gemini\t")).toEqual({ type: "empty" });
      expect(routeInput("@gemini\n")).toEqual({ type: "empty" });
    });

    it("@embedded만 단독 입력 → 빈 입력(backend만 토글)", () => {
      expect(routeInput("@embedded")).toEqual({ type: "empty" });
      expect(routeInput("@embedded\t")).toEqual({ type: "empty" });
      expect(routeInput("@embedded\n")).toEqual({ type: "empty" });
    });

    it("@cloud만 단독 입력 → 빈 입력(backend만 토글)", () => {
      expect(routeInput("@cloud")).toEqual({ type: "empty" });
      expect(routeInput("@cloud\t")).toEqual({ type: "empty" });
      expect(routeInput("@cloud\n")).toEqual({ type: "empty" });
    });

    it("@LOCAL만 단독 입력 대소문자 포함 입력도 빈 입력", () => {
      expect(routeInput("@LOCAL")).toEqual({ type: "empty" });
      expect(routeInput("@xLlM\t")).toEqual({ type: "empty" });
      expect(routeInput("@Gemini\n")).toEqual({ type: "empty" });
    });

    it("backend 키워드 아닌 @ → 기존 강제 AI (backend 없음)", () => {
      // `ls`는 backend 키워드가 아님 → 기존 동작 유지 (강제 AI 챗).
      expect(routeInput("@ls 왜 에러나는지 알려줘")).toEqual({
        type: "ai",
        question: "ls 왜 에러나는지 알려줘",
      });
    });

    it("대소문자 무관 — @LOCAL → backend=local", () => {
      expect(routeInput("@LOCAL hello")).toEqual({
        type: "ai",
        question: "hello",
        backend: "local",
      });
    });
  });

  describe("detectCodingIntent — 단위", () => {
    it("동사+명사 모두 매칭 → true", () => {
      expect(detectCodingIntent("함수 추가")).toBe(true);
      expect(detectCodingIntent("fix the bug")).toBe(true);
    });
    it("임계치 기준 동작 — 동사+명사 조합만 true", () => {
      expect(detectCodingIntent("버그 수정")).toBe(true);
      expect(detectCodingIntent("update code")).toBe(true);
      expect(detectCodingIntent("설명해 줘")).toBe(false);
    });
    it("동사만 → false (단, 리팩터링은 코딩 문맥으로 true)", () => {
      expect(detectCodingIntent("리팩터링해")).toBe(true);
      expect(detectCodingIntent("just fix it")).toBe(false);
    });
    it("명사만 → false", () => {
      expect(detectCodingIntent("이 함수 뭐임")).toBe(false);
      expect(detectCodingIntent("what's a class")).toBe(false);
    });
    it("빈 문자열 → false", () => {
      expect(detectCodingIntent("")).toBe(false);
    });
    it("영어 동사는 word boundary 적용 — 'added' 같은 활용형도 매칭", () => {
      // Phase 130-B: add(s|ed|ing) 활용형 지원.
      expect(detectCodingIntent("added function works")).toBe(true);
      expect(detectCodingIntent("add a function")).toBe(true);
      expect(detectCodingIntent("adding tests for parser")).toBe(true);
    });
    it("한글은 부분 매칭 — 한글은 활용 형태가 다양해 substring으로 충분", () => {
      // Phase 130-B: 활용형 fallback(추가해/추가하자/추가한다/추가하면/추가해줘) 보강.
      expect(detectCodingIntent("함수를 추가해줘")).toBe(true);
      expect(detectCodingIntent("리팩터링하자")).toBe(true);
      expect(detectCodingIntent("함수 추가했어")).toBe(true);
    });
    it("음성 케이스 보존 — 설명형 질문은 false", () => {
      expect(detectCodingIntent("함수 설명해줘")).toBe(false);
      expect(detectCodingIntent("explain this function")).toBe(false);
    });
  });
});

describe("routeInput — 추가 경계 검증", () => {
  it("backend-only 입력은 선행 개행/탭/유니코드 공백 포함해도 empty", () => {
    expect(routeInput("\r\n@local\t")).toEqual({ type: "empty" });
    expect(routeInput("\u2003@xllm\u2007")).toEqual({ type: "empty" });
    expect(routeInput("\u3000@Cloud\n")).toEqual({ type: "empty" });
  });

  it("backend 강제 뒤 본문은 공백 정규화 후 추론", () => {
    expect(routeInput("@LOCAL\thello world")).toEqual({
      type: "ai",
      question: "hello world",
      backend: "local",
    });
    expect(routeInput("\r@cloud\u2009이슈 정리해줘")).toEqual({
      type: "agent",
      task: "이슈 정리해줘",
      backend: "gemini",
    });
    expect(routeInput("@xllm\n\n이 버그 수정해줘")).toEqual({
      type: "agent",
      task: "이 버그 수정해줘",
      backend: "xllm",
    });
  });

  it("backend-only 입력 뒤 유니코드/개행 분리자는 empty로 정리", () => {
    expect(routeInput("@local\u00A0\u2007")).toEqual({ type: "empty" });
    expect(routeInput("@xllm\r\n")).toEqual({ type: "empty" });
  });

  it("backend + >> 강제는 분리자 공백 포함해도 유효하게 유지", () => {
    expect(routeInput("@local\t>>\t로그인 버그 수정")).toEqual({
      type: "agent",
      task: "로그인 버그 수정",
      backend: "local",
    });
    expect(routeInput("\n@cloud\r>>\r\n이슈 분석")).toEqual({
      type: "agent",
      task: "이슈 분석",
      backend: "gemini",
    });
  });

  it("비 backend @ 토큰은 기존 강제 AI로 유지", () => {
    expect(routeInput("@@local hi").type).toBe("ai");
    expect(routeInput("@@local hi").question).toBe("@local hi");
    expect(routeInput("@\u205Flocal hi")).toEqual({
      type: "ai",
      question: "local hi",
    });
  });

  it("백엔드 alias가 모호한 공백 조합은 backend 단독 입력으로 처리", () => {
    expect(routeInput("@ xllm")).toEqual({ type: "empty" });
    expect(routeInput("@ embedded   ")).toEqual({ type: "empty" });
    expect(routeInput("@sglang")).toEqual({ type: "empty" });
  });

  it("단독 @ 패턴은 공백/제어문자 혼합에서도 empty 처리", () => {
    expect(routeInput("@\n")).toEqual({ type: "empty" });
    expect(routeInput("@\t")).toEqual({ type: "empty" });
    expect(routeInput("@\u2007\t")).toEqual({ type: "empty" });
  });

  it("백엔드 키워드가 공백만 있어도 인식 가능한 경우는 rest 기반으로 판단", () => {
    expect(routeInput("@\t\txllm hi")).toEqual({
      type: "agent",
      task: "hi",
      backend: "xllm",
    });
    expect(routeInput("@\n\tembedded hi")).toEqual({
      type: "agent",
      task: "hi",
      backend: "local",
    });
  });

  it("백엔드 강제는 선행 공백/개행이 있어도 유지된다", () => {
    expect(routeInput(" \t@ local hi")).toEqual({
      type: "agent",
      task: "hi",
      backend: "local",
    });
    expect(routeInput("\n\t@ \r\nxllm 작업")).toEqual({
      type: "agent",
      task: "작업",
      backend: "xllm",
    });
    expect(routeInput("\u00A0@Embedded hello")).toEqual({
      type: "agent",
      task: "hello",
      backend: "local",
    });
  });

  it("명시적 shell 강제 `!`는 backend/AI 접두보다 항상 우선", () => {
    expect(routeInput("! @local hello")).toEqual({
      type: "shell",
      command: "@local hello",
    });
    expect(routeInput("!\n@xllm hi")).toEqual({
      type: "shell",
      command: "@xllm hi",
    });
  });

  it("비백엔드 @ token은 원문 텍스트를 강제 AI로 처리", () => {
    expect(routeInput("@xllm2 hi there")).toEqual({
      type: "ai",
      question: "xllm2 hi there",
    });
  });
});

describe("routeInput — shell prefix 경계 보강", () => {
  it("명시적 shell override `!`는 공백만 있으면 empty", () => {
    expect(routeInput("!\n")).toEqual({ type: "empty" });
    expect(routeInput("!\t\n")).toEqual({ type: "empty" });
    expect(routeInput("!   ")).toEqual({ type: "empty" });
  });

  it("기호 기반 shell prefix는 기존 규칙대로 shell로 처리", () => {
    expect(routeInput("| grep foo")).toEqual({ type: "shell", command: "| grep foo" });
    expect(routeInput("< input.txt")).toEqual({ type: "shell", command: "< input.txt" });
    expect(routeInput("`echo hi`")).toEqual({ type: "shell", command: "`echo hi`" });
    expect(routeInput("> output.txt")).toEqual({ type: "shell", command: "> output.txt" });
  });

  it("환경 변수/셸 변수 시그니처는 shell 강제로 처리", () => {
    expect(routeInput("$NODE_ENV=prod cmd")).toEqual({
      type: "shell",
      command: "$NODE_ENV=prod cmd",
    });
  });

  it("심볼/공백 변형 shell 명령도 shell로 유지", () => {
    expect(routeInput("|\n")).toEqual({
      type: "shell",
      command: "|",
    });
    expect(routeInput(" < file.txt")).toEqual({
      type: "shell",
      command: "< file.txt",
    });
    expect(routeInput("!\t")).toEqual({ type: "empty" });
    expect(routeInput(" \n! $NODE_ENV=dev echo hi")).toEqual({
      type: "shell",
      command: "$NODE_ENV=dev echo hi",
    });
  });

  it("leading whitespace이 있는 shell override는 여전히 shell", () => {
    expect(routeInput("   ! ls -la")).toEqual({
      type: "shell",
      command: "ls -la",
    });
    expect(routeInput("\n\t!   git status")).toEqual({
      type: "shell",
      command: "git status",
    });
    expect(routeInput("\u2003!\t echo hi")).toEqual({
      type: "shell",
      command: "echo hi",
    });
  });
});
