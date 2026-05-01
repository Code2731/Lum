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
    it("@ → 강제 AI (CLI 이름이라도)", () => {
      expect(routeInput("@ls 왜 에러나는지 알려줘")).toEqual({
        type: "ai",
        question: "ls 왜 에러나는지 알려줘",
      });
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

  // ─── Phase 124 — 자연어 코딩 의도 자동 라우팅 ─────────────────────────────
  describe("자연어 코딩 의도 → agent (Phase 124)", () => {
    describe("한국어 — 동사 + 명사 매칭", () => {
      it("'add 함수 추가해줘' → agent", () => {
        expect(routeInput("utils.ts에 add 함수 추가해줘")).toEqual({
          type: "agent",
          task: "utils.ts에 add 함수 추가해줘",
        });
      });
      it("'버그 고쳐줘' → agent", () => {
        expect(routeInput("로그인 버그 고쳐줘")).toEqual({
          type: "agent",
          task: "로그인 버그 고쳐줘",
        });
      });
      it("'테스트 작성' → agent", () => {
        expect(routeInput("이 함수에 테스트 작성")).toEqual({
          type: "agent",
          task: "이 함수에 테스트 작성",
        });
      });
      it("'컴포넌트 리팩터링' → agent", () => {
        expect(routeInput("Button 컴포넌트 리팩터링해")).toEqual({
          type: "agent",
          task: "Button 컴포넌트 리팩터링해",
        });
      });
      it("'코드 수정해' → agent", () => {
        expect(routeInput("이 코드 수정해줘")).toEqual({
          type: "agent",
          task: "이 코드 수정해줘",
        });
      });
    });

    describe("영어 — 동사 + 명사 매칭", () => {
      it("'add a function' → agent", () => {
        expect(routeInput("add a function to compute sum")).toEqual({
          type: "agent",
          task: "add a function to compute sum",
        });
      });
      it("'fix the bug' → agent", () => {
        expect(routeInput("fix the bug in login flow")).toEqual({
          type: "agent",
          task: "fix the bug in login flow",
        });
      });
      it("'refactor this module' → agent", () => {
        expect(routeInput("refactor this module to use hooks")).toEqual({
          type: "agent",
          task: "refactor this module to use hooks",
        });
      });
      it("'write tests' → agent", () => {
        expect(routeInput("write tests for the parser")).toEqual({
          type: "agent",
          task: "write tests for the parser",
        });
      });
      it("'rename the class' → agent", () => {
        expect(routeInput("rename the class from Foo to Bar")).toEqual({
          type: "agent",
          task: "rename the class from Foo to Bar",
        });
      });
    });

    describe("음성 케이스 — 단순 질문은 ai로 유지", () => {
      it("'이 코드 어떻게 동작해?' → ai (동사 없음)", () => {
        expect(routeInput("이 코드 어떻게 동작해?")).toEqual({
          type: "ai",
          question: "이 코드 어떻게 동작해?",
        });
      });
      it("'함수 설명해줘' → ai (코딩 동사 없음)", () => {
        expect(routeInput("이 함수 설명해줘")).toEqual({
          type: "ai",
          question: "이 함수 설명해줘",
        });
      });
      it("'how do I rebase' → ai (명사 없음)", () => {
        expect(routeInput("how do I rebase onto main?")).toEqual({
          type: "ai",
          question: "how do I rebase onto main?",
        });
      });
      it("'what is a closure' → ai (코딩 동사 없음)", () => {
        expect(routeInput("what is a closure")).toEqual({
          type: "ai",
          question: "what is a closure",
        });
      });
      it("순수 질문 — 동사·명사 모두 없음 → ai", () => {
        expect(routeInput("오늘 날씨 어때")).toEqual({
          type: "ai",
          question: "오늘 날씨 어때",
        });
      });
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

  describe("detectCodingIntent — 단위", () => {
    it("동사+명사 모두 매칭 → true", () => {
      expect(detectCodingIntent("함수 추가")).toBe(true);
      expect(detectCodingIntent("fix the bug")).toBe(true);
    });
    it("동사만 → false", () => {
      expect(detectCodingIntent("리팩터링해")).toBe(false);
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
      // "add"는 \\badd\\b — "added"는 add 매칭 안 됨 (word boundary). 보수적.
      expect(detectCodingIntent("added function works")).toBe(false);
      // 단어 그대로 "add a function" 형태에서만 매칭.
      expect(detectCodingIntent("add a function")).toBe(true);
    });
    it("한글은 부분 매칭 — 한글은 활용 형태가 다양해 substring으로 충분", () => {
      // "추가해줘", "추가했어", "추가하면" 모두 "추가"를 포함.
      expect(detectCodingIntent("함수를 추가해줘")).toBe(true);
      expect(detectCodingIntent("함수 추가했어")).toBe(true);
    });
  });
});
