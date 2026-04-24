import { describe, it, expect } from "vitest";
import { routeInput } from "./inputRouter";

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
});
