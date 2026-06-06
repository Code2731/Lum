import { getSpec } from "../data/cliSpecs";
import { parseBackendPrefixFromInput } from "./backendPrefix";

/**
 * 사용자 입력을 의미에 따라 라우팅한다.
 * 기본값은 자연어 → AI. 토큰 첫 단어가 알려진 CLI면 shell 직행.
 */

/**
 * AI 백엔드 강제 선택. 자원이 다른 백엔드들(임베디드 GPU vs 외부 서버 vs 클라우드)은
 * 공존하므로, 사용자가 작업별로 골라 쓸 수 있게 prefix 또는 UI에서 backend 명시.
 * undefined면 기본 라우팅(embedded → ollama → xllm → gemini fallback) 유지.
 */
export type AiBackend = "local" | "ollama" | "xllm" | "gemini";

export type Route =
  | { type: "shell"; command: string }
  | { type: "ai"; question: string; backend?: AiBackend }
  | { type: "aiCmd"; prompt: string }     // "# ..." — 자연어 → 명령어 변환 (인라인 제안)
  | { type: "explain"; command: string }  // "? ..." — 명령어 설명
  | { type: "agent"; task: string; backend?: AiBackend }   // ">> ..." — 에이전트 태스크
  | { type: "heavy"; prompt: string }     // "!! ..." — Heavy Track (mistral.rs 30B)
  | { type: "empty" };

// cliSpecs.ts에 없지만 흔한 POSIX/개발 도구 — 자연어로 오인되면 안 되는 것들만
const EXTRA_SHELL_TOOLS = new Set([
  // POSIX 빌트인·기본 명령
  "cd", "pwd", "echo", "export", "alias", "unalias", "source", "which", "whereis",
  "type", "exit", "logout", "history", "clear", "env", "set", "unset", "test",
  "true", "false", "read", "eval", "exec", "shift", "trap", "ulimit", "umask",
  "jobs", "fg", "bg", "wait", "times", "hash", "help", "let", "local", "return",
  // 파일·디렉토리
  "mkdir", "rmdir", "rm", "mv", "cp", "touch", "ln", "stat", "file", "basename",
  "dirname", "realpath", "readlink", "chown", "chgrp", "du", "df",
  // 텍스트·프로세싱
  "less", "more", "jq", "xargs", "tee", "cut", "tr", "sort", "uniq",
  "diff", "patch", "column", "paste", "nl", "fold", "fmt", "expand", "unexpand",
  // 시스템·네트워크
  "man", "info", "uname", "hostname", "whoami", "id", "groups", "uptime", "date",
  "top", "htop", "free", "vmstat", "iostat", "dmesg", "mount", "umount", "ifconfig",
  "ip", "route", "traceroute", "dig", "nslookup", "wget", "nc", "telnet",
  // 개발자 런타임·도구
  "node", "nodejs", "python3", "python2", "ruby", "go", "rustc", "cargo", "rustup",
  "tsc", "deno", "bun", "npx", "yarnpkg", "gem", "bundle", "composer", "mvn",
  "gradle", "gcc", "g++", "clang", "make", "cmake", "ctest", "ninja",
  "gdb", "lldb", "strace", "ltrace", "valgrind", "perf",
  // VCS·기타
  "hg", "svn", "fossil", "git-lfs", "gh", "glab", "tig",
  // 셸
  "bash", "zsh", "sh", "fish", "dash", "tcsh", "ksh", "pwsh", "powershell",
  // 컨테이너·K8s
  "podman", "buildah", "skopeo", "minikube", "kind", "k3s", "k9s",
  // 클라우드
  "aws", "gcloud", "az", "doctl", "heroku", "flyctl", "railway",
  // 에디터
  "vi", "nano", "emacs", "code", "subl", "nvim", "micro",
  // 기타
  "open", "start", "xdg-open", "pbcopy", "pbpaste", "say", "osascript",
]);

/** 첫 토큰이 shell 명령어로 인정되는지 — 빠른 local 판정 */
export function isKnownShellCommand(token: string): boolean {
  if (!token) return false;
  // 환경변수 지정 (FOO=bar command) → shell
  if (/^[A-Z_][A-Z0-9_]*=/.test(token)) return true;
  // cliSpecs 38종
  if (getSpec(token)) return true;
  // 확장 리스트
  if (EXTRA_SHELL_TOOLS.has(token)) return true;
  return false;
}

/**
 * 코딩 의도 감지 — Phase 130-B
 * 점수식: 동사 0.5 + 명사 0.5 + 컨텍스트 0.3, 임계값 0.6 이상이면 코딩 의도.
 * 컨텍스트 점수는 동사가 있을 때만 가산해 "함수 설명해줘" 같은 false positive를 억제.
 */
const CODING_VERBS_KO = [
  "수정", "추가", "구현", "고쳐", "고치", "리팩터", "리팩토링", "삭제",
  "작성", "변경", "바꿔", "만들어", "리네임", "재구성", "갱신", "업데이트",
];
const CODING_VERB_KO_SUFFIX_FORMS = [
  "추가해", "추가하자", "추가한다", "추가하면", "추가해줘",
  "수정해", "수정하자", "구현해", "리팩터링하자", "리팩터링해",
];
const CODING_VERBS_EN = [
  "fix", "add", "implement", "create", "refactor", "modify",
  "delete", "remove", "write", "change", "rename", "update",
  "resolve", "patch", "repair", "apply",
];
const CODING_NOUNS_KO = [
  "함수", "파일", "클래스", "메서드", "버그", "모듈", "컴포넌트",
  "훅", "테스트", "타입", "코드", "에러", "오류",
];
const CODING_NOUNS_EN = [
  "function", "file", "class", "method", "bug", "module", "component",
  "hook", "test", "type", "code", "error", "issue",
];
const CODING_CONTEXT_KO = ["버그", "에러", "오류", "테스트", "함수", "파일", "리팩터링"];
const CODING_CONTEXT_EN = ["bug", "error", "issue", "test", "function", "file", "refactor"];
const HEALING_INTENT_KO = ["거부 케이스", "실패 패턴", "내가 거부한", "거부한 케이스"];
const HEALING_INTENT_EN = ["rejected", "rejection", "failure pattern", "rejected case"];
const NATURAL_MUTATION_HINT_KO = ["버그", "이슈", "오류", "에러", "문제"];
const NATURAL_MUTATION_HINT_EN = ["bug", "issue", "error", "problem"];
const CODE_REVIEW_INTENT_KO = [
  "코드 리뷰",
  "프로젝트 리뷰",
  "리포 리뷰",
  "레포 리뷰",
  "문제점 리뷰",
  "버그 찾아",
  "버그 찾",
];
const CODE_REVIEW_INTENT_EN = [
  "code review",
  "project review",
  "review this project",
  "review this repo",
  "review the repo",
  "find bugs",
];

// 정규식은 module 로드 시 1회 컴파일 — 매 routeInput 호출마다 RegExp 재생성 회피.
// 영어 동사 활용형(s/ed/ing) + 명사 복수형(s?) 지원.
const CODING_VERB_RE_EN = CODING_VERBS_EN.map((v) => new RegExp(`\\b${v}(s|ed|ing)?\\b`));
const CODING_NOUN_RE_EN = CODING_NOUNS_EN.map((n) => new RegExp(`\\b${n}s?\\b`));
const CODING_CONTEXT_RE_EN = CODING_CONTEXT_EN.map((w) => new RegExp(`\\b${w}s?\\b`));
const HEALING_INTENT_RE_EN = HEALING_INTENT_EN.map(
  (w) => new RegExp(`\\b${w.replace(/\s+/g, "\\s+")}\\b`),
);
const NATURAL_MUTATION_HINT_RE_EN = NATURAL_MUTATION_HINT_EN.map(
  (w) => new RegExp(`\\b${w}s?\\b`),
);
const CODE_REVIEW_INTENT_RE_EN = CODE_REVIEW_INTENT_EN.map(
  (w) => new RegExp(`\\b${w.replace(/\s+/g, "\\s+")}\\b`),
);

/** 한국어는 활용 다양해 substring, 영어는 word boundary regex 병렬 매처. */
function matchAny(text: string, lower: string, koList: string[], enRegexes: RegExp[]): boolean {
  return (
    koList.some((w) => text.includes(w)) ||
    enRegexes.some((re) => re.test(lower))
  );
}

export function detectCodingIntent(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const hasVerb =
    matchAny(text, lower, CODING_VERBS_KO, CODING_VERB_RE_EN)
    || CODING_VERB_KO_SUFFIX_FORMS.some((w) => text.includes(w));
  const hasNoun = matchAny(text, lower, CODING_NOUNS_KO, CODING_NOUN_RE_EN);
  const hasContext = matchAny(text, lower, CODING_CONTEXT_KO, CODING_CONTEXT_RE_EN);

  let score = 0;
  if (hasVerb) score += 0.5;
  if (hasNoun) score += 0.5;
  // 컨텍스트 단독으로는 트리거되지 않도록 동사가 있을 때만 가산.
  if (hasVerb && hasContext) score += 0.3;
  return score >= 0.6;
}

const ROUTE_WHITESPACE = /\p{White_Space}/u;
const ROUTE_LEADING_WHITESPACE = /^[\p{White_Space}]+/u;
const ROUTE_TRIM_WHITESPACE = /^[\p{White_Space}]+|[\p{White_Space}]+$/gu;
const ROUTE_PREFIX_HEAVY = "!!";
const ROUTE_PREFIX_AGENT = ">>";
const ROUTE_PREFIX_ASK = "#";
const ROUTE_PREFIX_EXPLAIN = "?";
const ROUTE_PREFIX_SHELL = "!";

function trimRouteWhitespace(raw: string): string {
  return raw.replace(ROUTE_TRIM_WHITESPACE, "");
}

function trimRouteWhitespaceStart(raw: string): string {
  return raw.replace(ROUTE_LEADING_WHITESPACE, "");
}

function hasPrefixWithWhitespace(trimmed: string, prefix: string): boolean {
  if (!trimmed.startsWith(prefix)) return false;
  return ROUTE_WHITESPACE.test(trimmed.slice(prefix.length).charAt(0) ?? "");
}

function stripPrefix(trimmed: string, prefixLength: number): string {
  return trimRouteWhitespace(trimmed.slice(prefixLength));
}

/** Phase 134 — Healing 조회 의도 감지. 코딩 의도와 무관해도 agent로 라우팅. */
function detectHealingIntent(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    HEALING_INTENT_KO.some((w) => text.includes(w))
    || HEALING_INTENT_RE_EN.some((re) => re.test(lower))
  );
}

/** 코드/프로젝트 리뷰는 수정 의도가 없어도 파일 탐색 도구가 필요한 읽기 전용 agent 작업이다. */
function detectCodeReviewIntent(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    CODE_REVIEW_INTENT_KO.some((w) => text.includes(w))
    || CODE_REVIEW_INTENT_RE_EN.some((re) => re.test(lower))
  );
}

/** `patch the issue`처럼 CLI 이름으로 시작하지만 자연어 수정 요청인 케이스. */
function detectNaturalMutationBeforeCli(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (!/^(patch|resolve|repair|apply)\b/.test(lower)) return false;
  return matchAny(text, lower, NATURAL_MUTATION_HINT_KO, NATURAL_MUTATION_HINT_RE_EN);
}

/** 입력 전체가 shell 특수문자로 시작하는지 (path, pipe, redirect 등) */
function startsWithShellPrefix(trimmed: string): boolean {
  if (!trimmed) return false;
  const c = trimmed[0];
  // 경로
  if (c === "/" || c === "~") return true;
  if (trimmed.startsWith("./") || trimmed.startsWith("../")) return true;
  // 리다이렉트·파이프·변수
  if (c === "|" || c === ">" || c === "<" || c === "&" || c === "$") return true;
  // 백틱 커맨드 치환
  if (c === "`") return true;
  // sudo·환경 prefix 뒤에도 CLI가 올 것이므로 일단 shell로 취급
  return false;
}

export function routeInput(raw: string): Route {
  const trimmed = trimRouteWhitespace(raw);
  if (!trimmed) return { type: "empty" };

  // 1. 명시적 prefix들 — 우선순위 최상
  if (trimmed.startsWith(ROUTE_PREFIX_HEAVY)) {
    return { type: "heavy", prompt: stripPrefix(trimmed, ROUTE_PREFIX_HEAVY.length) };
  }
  if (trimmed.startsWith(ROUTE_PREFIX_AGENT)) {
    return { type: "agent", task: stripPrefix(trimmed, ROUTE_PREFIX_AGENT.length) };
  }
  if (hasPrefixWithWhitespace(trimmed, ROUTE_PREFIX_ASK)) {
    return { type: "aiCmd", prompt: stripPrefix(trimmed, ROUTE_PREFIX_ASK.length) };
  }
  if (hasPrefixWithWhitespace(trimmed, ROUTE_PREFIX_EXPLAIN)) {
    return { type: "explain", command: stripPrefix(trimmed, ROUTE_PREFIX_EXPLAIN.length) };
  }

  // 2. override: `!` → 강제 shell, `@` → 강제 AI / `@<backend>` → 백엔드 강제
  if (trimmed.startsWith(ROUTE_PREFIX_SHELL)) {
    const stripped = trimRouteWhitespaceStart(trimmed.slice(1));
    if (!stripped) return { type: "empty" };
    return { type: "shell", command: stripped };
  }
  if (trimmed.startsWith("@")) {
    const backendPrefix = parseBackendPrefixFromInput(trimmed);
    if (backendPrefix) {
      const { backend, rest } = backendPrefix;
      if (!rest) {
        return { type: "empty" };
      }
      // @backend >> task 형태는 코딩 의도 감지와 무관하게 강제 agent로 처리.
      // 예: "@local >> 테스트 실패 원인 찾아서 수정해줘"
      if (rest.startsWith(">>")) {
        const task = trimRouteWhitespace(rest.slice(2));
        if (!task) return { type: "empty" };
        return { type: "agent", task, backend };
      }
      // 리뷰 의도도 파일 탐색 도구가 필요하므로 backend를 유지한 채 agent로 보낸다.
      if (detectCodeReviewIntent(rest)) {
        return { type: "agent", task: rest, backend };
      }
      // backend 명시했더라도 코딩 의도 있으면 agent로 (둘 다 backend 필드 받음).
      if (detectCodingIntent(rest)) {
        return { type: "agent", task: rest, backend };
      }
      return { type: "ai", question: rest, backend };
    }

    const stripped = trimRouteWhitespaceStart(trimmed.slice(1));
    if (!stripped) {
      return { type: "empty" };
    }
    return { type: "ai", question: stripped };
  }

  // 3. 리뷰 의도와 CLI처럼 보이는 자연어 수정 요청은 CLI 판정보다 우선.
  if (detectCodeReviewIntent(trimmed)) {
    return { type: "agent", task: trimmed };
  }
  if (detectNaturalMutationBeforeCli(trimmed)) {
    return { type: "agent", task: trimmed };
  }

  // 4. shell 특수문자 시작 → shell
  if (startsWithShellPrefix(trimmed)) {
    return { type: "shell", command: trimmed };
  }

  // 5. 첫 토큰이 알려진 CLI → shell
  const firstToken = trimmed.split(ROUTE_WHITESPACE)[0];
  if (isKnownShellCommand(firstToken)) {
    return { type: "shell", command: trimmed };
  }

  // 6. Healing 조회 의도 → 자동 agent 라우팅
  if (detectHealingIntent(trimmed)) {
    return { type: "agent", task: trimmed };
  }

  // 7. (Phase 124) 자연어이지만 코딩 의도 감지 → 자동 agent 라우팅
  if (detectCodingIntent(trimmed)) {
    return { type: "agent", task: trimmed };
  }

  // 8. 그 외 전부 AI (기본값 — 단순 질문/대화)
  return { type: "ai", question: trimmed };
}
