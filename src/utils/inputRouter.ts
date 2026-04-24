import { getSpec } from "../data/cliSpecs";

/**
 * 사용자 입력을 의미에 따라 라우팅한다.
 * 기본값은 자연어 → AI. 토큰 첫 단어가 알려진 CLI면 shell 직행.
 */
export type Route =
  | { type: "shell"; command: string }
  | { type: "ai"; question: string }
  | { type: "aiCmd"; prompt: string }     // "# ..." — 자연어 → 명령어 변환 (인라인 제안)
  | { type: "explain"; command: string }  // "? ..." — 명령어 설명
  | { type: "agent"; task: string }       // ">> ..." — 에이전트 태스크
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
  const trimmed = raw.trim();
  if (!trimmed) return { type: "empty" };

  // 1. 명시적 prefix들 — 우선순위 최상
  if (trimmed.startsWith(">>")) {
    return { type: "agent", task: trimmed.replace(/^>>\s*/, "").trim() };
  }
  if (trimmed.startsWith("# ")) {
    return { type: "aiCmd", prompt: trimmed.slice(2).trim() };
  }
  if (trimmed.startsWith("? ")) {
    return { type: "explain", command: trimmed.slice(2).trim() };
  }

  // 2. override: `!` → 강제 shell, `@` → 강제 AI
  if (trimmed.startsWith("!")) {
    const stripped = trimmed.slice(1).trimStart();
    return { type: "shell", command: stripped };
  }
  if (trimmed.startsWith("@")) {
    return { type: "ai", question: trimmed.slice(1).trimStart() };
  }

  // 3. shell 특수문자 시작 → shell
  if (startsWithShellPrefix(trimmed)) {
    return { type: "shell", command: trimmed };
  }

  // 4. 첫 토큰이 알려진 CLI → shell
  const firstToken = trimmed.split(/\s+/)[0];
  if (isKnownShellCommand(firstToken)) {
    return { type: "shell", command: trimmed };
  }

  // 5. 그 외 전부 AI (기본값)
  return { type: "ai", question: trimmed };
}
