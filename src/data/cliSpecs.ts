export interface CliFlag {
  flag: string;
  description: string;
}

export interface CliSubcommand {
  name: string;
  description: string;
  flags?: CliFlag[];
}

export interface CliSpec {
  tool: string;
  subcommands: CliSubcommand[];
  globalFlags?: CliFlag[];
}

export const CLI_SPECS: CliSpec[] = [
  {
    tool: "git",
    subcommands: [
      { name: "add", description: "Stage changes", flags: [{ flag: "-A", description: "Stage all" }, { flag: "-p", description: "Interactive patch" }] },
      { name: "commit", description: "Record changes", flags: [{ flag: "-m", description: "Message" }, { flag: "--amend", description: "Amend last commit" }, { flag: "--no-verify", description: "Skip hooks" }] },
      { name: "push", description: "Upload to remote", flags: [{ flag: "--force-with-lease", description: "Safe force push" }, { flag: "-u", description: "Set upstream" }] },
      { name: "pull", description: "Download and merge", flags: [{ flag: "--rebase", description: "Rebase instead of merge" }] },
      { name: "checkout", description: "Switch branches or restore files", flags: [{ flag: "-b", description: "Create and switch" }] },
      { name: "switch", description: "Switch branches", flags: [{ flag: "-c", description: "Create new branch" }] },
      { name: "branch", description: "List/create/delete branches", flags: [{ flag: "-d", description: "Delete branch" }, { flag: "-D", description: "Force delete" }, { flag: "-a", description: "List all" }] },
      { name: "status", description: "Show working tree status", flags: [{ flag: "-s", description: "Short format" }] },
      { name: "log", description: "Show commit history", flags: [{ flag: "--oneline", description: "Compact format" }, { flag: "--graph", description: "ASCII graph" }, { flag: "-n", description: "Limit count" }] },
      { name: "diff", description: "Show changes", flags: [{ flag: "--cached", description: "Show staged" }, { flag: "--stat", description: "Stats only" }] },
      { name: "stash", description: "Stash changes", flags: [{ flag: "pop", description: "Apply and remove stash" }, { flag: "list", description: "List stashes" }] },
      { name: "rebase", description: "Reapply commits", flags: [{ flag: "-i", description: "Interactive" }, { flag: "--abort", description: "Abort rebase" }, { flag: "--continue", description: "Continue rebase" }] },
      { name: "merge", description: "Join branches", flags: [{ flag: "--no-ff", description: "No fast-forward" }, { flag: "--abort", description: "Abort merge" }] },
      { name: "clone", description: "Clone repository", flags: [{ flag: "--depth", description: "Shallow clone" }, { flag: "-b", description: "Branch" }] },
      { name: "remote", description: "Manage remotes", flags: [{ flag: "-v", description: "Verbose" }] },
      { name: "fetch", description: "Download from remote", flags: [{ flag: "--all", description: "All remotes" }, { flag: "--prune", description: "Remove stale" }] },
      { name: "reset", description: "Reset HEAD", flags: [{ flag: "--soft", description: "Keep staged" }, { flag: "--hard", description: "Discard all" }, { flag: "--mixed", description: "Unstage (default)" }] },
      { name: "tag", description: "Manage tags", flags: [{ flag: "-a", description: "Annotated tag" }, { flag: "-d", description: "Delete tag" }] },
      { name: "cherry-pick", description: "Apply commits", flags: [{ flag: "-n", description: "No commit" }] },
      { name: "bisect", description: "Binary search bugs", flags: [] },
      { name: "blame", description: "Show line authorship", flags: [{ flag: "-L", description: "Line range" }] },
      { name: "show", description: "Show object", flags: [{ flag: "--stat", description: "Stats" }] },
    ],
  },
  {
    tool: "npm",
    subcommands: [
      { name: "install", description: "Install packages", flags: [{ flag: "--save-dev", description: "Dev dependency" }, { flag: "-g", description: "Global" }, { flag: "--legacy-peer-deps", description: "Ignore peer deps" }] },
      { name: "run", description: "Run script", flags: [] },
      { name: "test", description: "Run tests", flags: [{ flag: "--watch", description: "Watch mode" }] },
      { name: "build", description: "Build project", flags: [] },
      { name: "start", description: "Start app", flags: [] },
      { name: "publish", description: "Publish package", flags: [{ flag: "--dry-run", description: "Simulate" }, { flag: "--access", description: "public/private" }] },
      { name: "update", description: "Update packages", flags: [] },
      { name: "uninstall", description: "Remove package", flags: [{ flag: "-g", description: "Global" }] },
      { name: "ci", description: "Clean install", flags: [] },
      { name: "audit", description: "Security audit", flags: [{ flag: "--fix", description: "Auto-fix" }] },
      { name: "outdated", description: "List outdated", flags: [] },
      { name: "init", description: "Init package.json", flags: [{ flag: "-y", description: "Accept defaults" }] },
      { name: "link", description: "Symlink package", flags: [] },
      { name: "list", description: "List packages", flags: [{ flag: "--depth", description: "Tree depth" }] },
    ],
  },
  {
    tool: "cargo",
    subcommands: [
      { name: "build", description: "Compile", flags: [{ flag: "--release", description: "Optimized" }, { flag: "--target", description: "Target triple" }] },
      { name: "run", description: "Build and run", flags: [{ flag: "--release", description: "Optimized" }, { flag: "--bin", description: "Binary name" }] },
      { name: "test", description: "Run tests", flags: [{ flag: "--release", description: "Optimized" }, { flag: "--no-run", description: "Compile only" }] },
      { name: "check", description: "Check without building", flags: [] },
      { name: "clippy", description: "Lint", flags: [{ flag: "--", description: "Extra flags" }] },
      { name: "fmt", description: "Format code", flags: [{ flag: "--check", description: "Check only" }] },
      { name: "add", description: "Add dependency", flags: [{ flag: "--dev", description: "Dev dependency" }, { flag: "--features", description: "Features" }] },
      { name: "update", description: "Update Cargo.lock", flags: [] },
      { name: "clean", description: "Remove build artifacts", flags: [] },
      { name: "doc", description: "Generate docs", flags: [{ flag: "--open", description: "Open browser" }] },
      { name: "publish", description: "Publish crate", flags: [{ flag: "--dry-run", description: "Simulate" }] },
      { name: "new", description: "New package", flags: [{ flag: "--lib", description: "Library" }, { flag: "--bin", description: "Binary" }] },
      { name: "init", description: "Init in directory", flags: [{ flag: "--lib", description: "Library" }] },
    ],
  },
  {
    tool: "docker",
    subcommands: [
      { name: "build", description: "Build image", flags: [{ flag: "-t", description: "Tag" }, { flag: "--no-cache", description: "No cache" }, { flag: "--platform", description: "Target platform" }] },
      { name: "run", description: "Run container", flags: [{ flag: "-d", description: "Detached" }, { flag: "-p", description: "Port mapping" }, { flag: "--rm", description: "Auto remove" }, { flag: "-v", description: "Volume mount" }, { flag: "-e", description: "Env var" }, { flag: "--name", description: "Container name" }] },
      { name: "ps", description: "List containers", flags: [{ flag: "-a", description: "All" }] },
      { name: "images", description: "List images", flags: [{ flag: "-a", description: "All" }] },
      { name: "pull", description: "Pull image", flags: [] },
      { name: "push", description: "Push image", flags: [] },
      { name: "stop", description: "Stop container", flags: [] },
      { name: "rm", description: "Remove container", flags: [{ flag: "-f", description: "Force" }] },
      { name: "rmi", description: "Remove image", flags: [{ flag: "-f", description: "Force" }] },
      { name: "exec", description: "Run in container", flags: [{ flag: "-it", description: "Interactive TTY" }] },
      { name: "logs", description: "Container logs", flags: [{ flag: "-f", description: "Follow" }, { flag: "--tail", description: "Last N lines" }] },
      { name: "compose", description: "Compose commands", flags: [] },
    ],
  },
  {
    tool: "kubectl",
    subcommands: [
      { name: "get", description: "Get resources", flags: [{ flag: "-n", description: "Namespace" }, { flag: "-o", description: "Output format" }, { flag: "--all-namespaces", description: "All namespaces" }] },
      { name: "apply", description: "Apply config", flags: [{ flag: "-f", description: "File/dir" }, { flag: "--dry-run", description: "Simulate" }] },
      { name: "delete", description: "Delete resources", flags: [{ flag: "-f", description: "File" }, { flag: "--grace-period", description: "Termination seconds" }] },
      { name: "describe", description: "Show details", flags: [{ flag: "-n", description: "Namespace" }] },
      { name: "logs", description: "Pod logs", flags: [{ flag: "-f", description: "Follow" }, { flag: "--previous", description: "Previous container" }, { flag: "-n", description: "Namespace" }] },
      { name: "exec", description: "Execute in pod", flags: [{ flag: "-it", description: "Interactive TTY" }, { flag: "-n", description: "Namespace" }] },
      { name: "scale", description: "Scale deployment", flags: [{ flag: "--replicas", description: "Replica count" }] },
      { name: "rollout", description: "Rollout management", flags: [] },
      { name: "port-forward", description: "Forward ports", flags: [{ flag: "-n", description: "Namespace" }] },
      { name: "config", description: "kubeconfig", flags: [] },
    ],
  },
  {
    tool: "ls",
    subcommands: [],
    globalFlags: [
      { flag: "-la", description: "List all with details" },
      { flag: "-lh", description: "Human-readable sizes" },
      { flag: "-lt", description: "Sort by time" },
      { flag: "-lS", description: "Sort by size" },
      { flag: "-R", description: "Recursive" },
    ],
  },
  {
    tool: "grep",
    subcommands: [],
    globalFlags: [
      { flag: "-r", description: "Recursive" },
      { flag: "-n", description: "Line numbers" },
      { flag: "-i", description: "Case insensitive" },
      { flag: "-l", description: "Files only" },
      { flag: "-v", description: "Invert match" },
      { flag: "-E", description: "Extended regex" },
      { flag: "--include", description: "File pattern" },
    ],
  },
  {
    tool: "curl",
    subcommands: [],
    globalFlags: [
      { flag: "-X", description: "HTTP method" },
      { flag: "-H", description: "Header" },
      { flag: "-d", description: "Request body" },
      { flag: "-o", description: "Output file" },
      { flag: "-s", description: "Silent" },
      { flag: "-v", description: "Verbose" },
      { flag: "--json", description: "JSON body + headers" },
    ],
  },
  {
    tool: "ssh",
    subcommands: [],
    globalFlags: [
      { flag: "-i", description: "Identity file" },
      { flag: "-p", description: "Port" },
      { flag: "-L", description: "Local port forward" },
      { flag: "-R", description: "Remote port forward" },
      { flag: "-N", description: "No command" },
    ],
  },
  {
    tool: "find",
    subcommands: [],
    globalFlags: [
      { flag: "-name", description: "Name pattern" },
      { flag: "-type", description: "f=file, d=dir" },
      { flag: "-mtime", description: "Modified time" },
      { flag: "-exec", description: "Execute command" },
      { flag: "-maxdepth", description: "Max depth" },
      { flag: "-size", description: "File size" },
    ],
  },
  {
    tool: "yarn",
    subcommands: [
      { name: "install", description: "Install dependencies", flags: [{ flag: "--frozen-lockfile", description: "CI 모드" }, { flag: "--production", description: "프로덕션만" }] },
      { name: "add", description: "패키지 추가", flags: [{ flag: "--dev", description: "dev 의존성" }, { flag: "--exact", description: "정확한 버전" }] },
      { name: "remove", description: "패키지 제거", flags: [] },
      { name: "run", description: "스크립트 실행", flags: [] },
      { name: "build", description: "빌드", flags: [] },
      { name: "test", description: "테스트 실행", flags: [] },
      { name: "upgrade", description: "패키지 업그레이드", flags: [{ flag: "--latest", description: "최신 버전" }] },
    ],
    globalFlags: [
      { flag: "--dev", description: "dev 의존성" },
      { flag: "--exact", description: "정확한 버전 고정" },
      { flag: "--frozen-lockfile", description: "lockfile 변경 금지" },
    ],
  },
  {
    tool: "pnpm",
    subcommands: [
      { name: "install", description: "의존성 설치", flags: [{ flag: "--frozen-lockfile", description: "lockfile 고정" }] },
      { name: "add", description: "패키지 추가", flags: [{ flag: "--save-dev", description: "dev 의존성" }, { flag: "--global", description: "전역 설치" }] },
      { name: "remove", description: "패키지 제거", flags: [] },
      { name: "run", description: "스크립트 실행", flags: [] },
      { name: "build", description: "빌드", flags: [] },
      { name: "test", description: "테스트 실행", flags: [] },
      { name: "update", description: "패키지 업데이트", flags: [{ flag: "--latest", description: "최신 버전" }] },
      { name: "init", description: "package.json 초기화", flags: [] },
    ],
    globalFlags: [
      { flag: "--save-dev", description: "dev 의존성" },
      { flag: "--global", description: "전역 설치" },
      { flag: "--filter", description: "모노레포 필터" },
    ],
  },
  {
    tool: "python",
    subcommands: [],
    globalFlags: [
      { flag: "-m", description: "모듈로 실행 (예: -m pip)" },
      { flag: "-c", description: "인라인 코드 실행" },
      { flag: "-i", description: "인터랙티브 모드" },
      { flag: "-V", description: "버전 출력" },
      { flag: "-u", description: "unbuffered stdout/stderr" },
    ],
  },
  {
    tool: "pip",
    subcommands: [
      { name: "install", description: "패키지 설치", flags: [{ flag: "-r", description: "requirements 파일" }, { flag: "--upgrade", description: "업그레이드" }, { flag: "--user", description: "사용자 설치" }, { flag: "-q", description: "조용히" }] },
      { name: "uninstall", description: "패키지 제거", flags: [{ flag: "-y", description: "확인 없이" }] },
      { name: "list", description: "설치된 패키지 목록", flags: [{ flag: "--outdated", description: "오래된 패키지" }] },
      { name: "show", description: "패키지 정보 표시", flags: [] },
      { name: "freeze", description: "설치 목록 출력 (requirements 형식)", flags: [] },
    ],
    globalFlags: [
      { flag: "-r", description: "requirements 파일" },
      { flag: "--upgrade", description: "업그레이드" },
      { flag: "--user", description: "사용자 홈에 설치" },
      { flag: "-q", description: "출력 최소화" },
    ],
  },
  {
    tool: "docker-compose",
    subcommands: [
      { name: "up", description: "서비스 시작", flags: [{ flag: "-d", description: "백그라운드" }, { flag: "--build", description: "빌드 후 시작" }, { flag: "--scale", description: "서비스 스케일" }, { flag: "--no-deps", description: "의존성 제외" }] },
      { name: "down", description: "서비스 중지 및 제거", flags: [{ flag: "-v", description: "볼륨 제거" }] },
      { name: "build", description: "서비스 이미지 빌드", flags: [{ flag: "--no-cache", description: "캐시 없이" }] },
      { name: "logs", description: "서비스 로그 조회", flags: [{ flag: "-f", description: "실시간 팔로우" }, { flag: "--tail", description: "마지막 N줄" }] },
      { name: "ps", description: "서비스 상태 확인", flags: [] },
      { name: "restart", description: "서비스 재시작", flags: [] },
      { name: "exec", description: "실행 중인 컨테이너에 명령 실행", flags: [{ flag: "-T", description: "TTY 없음" }] },
    ],
    globalFlags: [
      { flag: "-d", description: "백그라운드 실행" },
      { flag: "-f", description: "compose 파일 지정" },
      { flag: "--build", description: "시작 전 빌드" },
      { flag: "--scale", description: "서비스 인스턴스 수" },
      { flag: "--no-deps", description: "연결 서비스 제외" },
    ],
  },
  {
    tool: "terraform",
    subcommands: [
      { name: "init", description: "작업 디렉토리 초기화", flags: [{ flag: "-upgrade", description: "프로바이더 업그레이드" }] },
      { name: "plan", description: "실행 계획 생성", flags: [{ flag: "-var", description: "변수 설정" }, { flag: "-var-file", description: "변수 파일" }, { flag: "-target", description: "특정 리소스" }] },
      { name: "apply", description: "인프라 적용", flags: [{ flag: "-auto-approve", description: "자동 승인" }, { flag: "-var", description: "변수 설정" }, { flag: "-target", description: "특정 리소스" }] },
      { name: "destroy", description: "인프라 삭제", flags: [{ flag: "-auto-approve", description: "자동 승인" }] },
      { name: "validate", description: "설정 유효성 검사", flags: [] },
      { name: "output", description: "출력값 확인", flags: [{ flag: "-json", description: "JSON 형식" }] },
      { name: "state", description: "상태 관리", flags: [] },
      { name: "import", description: "기존 리소스 임포트", flags: [] },
    ],
    globalFlags: [
      { flag: "-auto-approve", description: "확인 없이 자동 적용" },
      { flag: "-var", description: "변수 설정" },
      { flag: "-var-file", description: "변수 파일 지정" },
      { flag: "-target", description: "특정 리소스만 대상" },
    ],
  },
  {
    tool: "helm",
    subcommands: [
      { name: "install", description: "차트 설치", flags: [{ flag: "-n", description: "네임스페이스" }, { flag: "--set", description: "값 설정" }, { flag: "-f", description: "values 파일" }, { flag: "--dry-run", description: "시뮬레이션" }, { flag: "--version", description: "버전 지정" }] },
      { name: "upgrade", description: "릴리스 업그레이드", flags: [{ flag: "--install", description: "없으면 설치" }, { flag: "--set", description: "값 설정" }] },
      { name: "uninstall", description: "릴리스 제거", flags: [{ flag: "-n", description: "네임스페이스" }] },
      { name: "list", description: "릴리스 목록", flags: [{ flag: "-n", description: "네임스페이스" }, { flag: "--all-namespaces", description: "전체 네임스페이스" }] },
      { name: "repo", description: "차트 레포지토리 관리", flags: [] },
      { name: "pull", description: "차트 다운로드", flags: [{ flag: "--untar", description: "자동 압축 해제" }] },
      { name: "push", description: "차트 업로드", flags: [] },
      { name: "template", description: "템플릿 렌더링", flags: [{ flag: "--set", description: "값 설정" }, { flag: "-f", description: "values 파일" }] },
    ],
    globalFlags: [
      { flag: "-n", description: "네임스페이스" },
      { flag: "--namespace", description: "네임스페이스 지정" },
      { flag: "--set", description: "값 직접 설정" },
      { flag: "-f", description: "values 파일" },
      { flag: "--dry-run", description: "실제 배포 없이 시뮬레이션" },
      { flag: "--version", description: "차트 버전" },
    ],
  },
  {
    tool: "rsync",
    subcommands: [],
    globalFlags: [
      { flag: "-avz", description: "아카이브·상세·압축" },
      { flag: "-r", description: "재귀 복사" },
      { flag: "--delete", description: "소스에 없는 파일 삭제" },
      { flag: "--exclude", description: "제외 패턴" },
      { flag: "--progress", description: "진행률 표시" },
      { flag: "-e", description: "원격 셸 지정 (예: -e ssh)" },
      { flag: "-n", description: "dry-run (실제 실행 안 함)" },
    ],
  },
  {
    tool: "make",
    subcommands: [],
    globalFlags: [
      { flag: "-j", description: "병렬 작업 수" },
      { flag: "-n", description: "dry-run" },
      { flag: "-C", description: "디렉토리 변경 후 실행" },
      { flag: "-f", description: "Makefile 지정" },
      { flag: "-k", description: "에러 시 계속 진행" },
      { flag: "--dry-run", description: "실행 없이 명령만 출력" },
    ],
  },
  {
    tool: "ps",
    subcommands: [],
    globalFlags: [
      { flag: "aux", description: "전체 프로세스 상세 목록" },
      { flag: "-ef", description: "전체 프로세스 (유닉스 스타일)" },
      { flag: "-p", description: "특정 PID" },
      { flag: "-u", description: "특정 사용자" },
      { flag: "--sort", description: "정렬 기준 (예: --sort=-%mem)" },
    ],
  },
  {
    tool: "kill",
    subcommands: [],
    globalFlags: [
      { flag: "-9", description: "강제 종료 (SIGKILL)" },
      { flag: "-15", description: "정상 종료 (SIGTERM)" },
      { flag: "-l", description: "시그널 목록" },
      { flag: "-SIGTERM", description: "정상 종료 요청" },
      { flag: "-SIGKILL", description: "강제 종료" },
    ],
  },
  {
    tool: "tar",
    subcommands: [],
    globalFlags: [
      { flag: "-czf", description: "gzip 압축 아카이브 생성" },
      { flag: "-xzf", description: "gzip 압축 해제" },
      { flag: "-tvf", description: "아카이브 내용 목록" },
      { flag: "--extract", description: "압축 해제" },
      { flag: "-C", description: "해제 디렉토리 지정" },
      { flag: "-v", description: "상세 출력" },
    ],
  },
  {
    tool: "chmod",
    subcommands: [],
    globalFlags: [
      { flag: "-R", description: "재귀 적용" },
      { flag: "755", description: "소유자 rwx, 그 외 rx" },
      { flag: "644", description: "소유자 rw, 그 외 r" },
      { flag: "+x", description: "실행 권한 추가" },
      { flag: "u+x", description: "소유자 실행 권한 추가" },
    ],
  },
  {
    tool: "apt",
    subcommands: [
      { name: "install", description: "패키지 설치", flags: [{ flag: "-y", description: "자동 확인" }, { flag: "--no-install-recommends", description: "권장 패키지 제외" }] },
      { name: "remove", description: "패키지 제거", flags: [{ flag: "-y", description: "자동 확인" }] },
      { name: "update", description: "패키지 목록 갱신", flags: [] },
      { name: "upgrade", description: "설치된 패키지 업그레이드", flags: [{ flag: "-y", description: "자동 확인" }] },
      { name: "search", description: "패키지 검색", flags: [] },
      { name: "show", description: "패키지 정보 표시", flags: [] },
      { name: "list", description: "패키지 목록", flags: [{ flag: "--installed", description: "설치된 것만" }] },
    ],
    globalFlags: [
      { flag: "-y", description: "자동 확인" },
      { flag: "--no-install-recommends", description: "권장 패키지 제외" },
      { flag: "--fix-broken", description: "의존성 오류 수정" },
    ],
  },
  {
    tool: "brew",
    subcommands: [
      { name: "install", description: "패키지 설치", flags: [{ flag: "--cask", description: "Cask 앱 설치" }, { flag: "--formula", description: "수식 설치" }, { flag: "--no-quarantine", description: "보안 격리 없이" }] },
      { name: "uninstall", description: "패키지 제거", flags: [{ flag: "--cask", description: "Cask 앱 제거" }] },
      { name: "update", description: "Homebrew 업데이트", flags: [] },
      { name: "upgrade", description: "패키지 업그레이드", flags: [{ flag: "--cask", description: "Cask 앱 업그레이드" }] },
      { name: "search", description: "패키지 검색", flags: [] },
      { name: "info", description: "패키지 정보", flags: [] },
      { name: "list", description: "설치된 패키지 목록", flags: [{ flag: "--cask", description: "Cask 목록" }] },
      { name: "link", description: "패키지 링크", flags: [{ flag: "--overwrite", description: "덮어쓰기" }] },
      { name: "unlink", description: "패키지 링크 해제", flags: [] },
    ],
    globalFlags: [
      { flag: "--cask", description: "Cask(GUI 앱) 대상" },
      { flag: "--formula", description: "수식(CLI 도구) 대상" },
      { flag: "--no-quarantine", description: "macOS 보안 격리 비활성화" },
    ],
  },
  {
    tool: "ping",
    subcommands: [],
    globalFlags: [
      { flag: "-c", description: "요청 횟수 지정" },
      { flag: "-i", description: "전송 간격(초)" },
      { flag: "-t", description: "TTL 설정" },
      { flag: "-W", description: "응답 대기 시간(초)" },
      { flag: "-s", description: "패킷 크기" },
    ],
  },
  {
    tool: "cat",
    subcommands: [],
    globalFlags: [
      { flag: "-n", description: "줄 번호 표시" },
      { flag: "-A", description: "특수문자 표시" },
      { flag: "-s", description: "연속 빈 줄 압축" },
    ],
  },
  {
    tool: "tail",
    subcommands: [],
    globalFlags: [
      { flag: "-f", description: "실시간 팔로우" },
      { flag: "-n", description: "마지막 N줄" },
      { flag: "-F", description: "파일 재생성 감지 팔로우" },
      { flag: "--lines", description: "출력할 줄 수" },
    ],
  },
  {
    tool: "head",
    subcommands: [],
    globalFlags: [
      { flag: "-n", description: "처음 N줄 출력" },
      { flag: "-c", description: "처음 N바이트 출력" },
    ],
  },
  {
    tool: "wc",
    subcommands: [],
    globalFlags: [
      { flag: "-l", description: "줄 수" },
      { flag: "-w", description: "단어 수" },
      { flag: "-c", description: "바이트 수" },
      { flag: "-m", description: "문자 수" },
    ],
  },
  {
    tool: "sed",
    subcommands: [],
    globalFlags: [
      { flag: "-i", description: "파일 직접 수정 (in-place)" },
      { flag: "-n", description: "자동 출력 억제" },
      { flag: "-e", description: "인라인 스크립트 지정" },
      { flag: "-r", description: "확장 정규식 (GNU)" },
      { flag: "-E", description: "확장 정규식 (BSD/macOS)" },
    ],
  },
  {
    tool: "awk",
    subcommands: [],
    globalFlags: [
      { flag: "-F", description: "필드 구분자 지정" },
      { flag: "-v", description: "변수 설정" },
      { flag: "-f", description: "awk 스크립트 파일" },
      { flag: "-OFS", description: "출력 필드 구분자" },
    ],
  },
  {
    tool: "vim",
    subcommands: [],
    globalFlags: [
      { flag: "-R", description: "읽기 전용 모드" },
      { flag: "-n", description: "swap 파일 없음" },
      { flag: "-d", description: "diff 모드" },
      { flag: "+<cmd>", description: "시작 시 명령 실행" },
      { flag: "-p", description: "탭으로 여러 파일 열기" },
      { flag: "-o", description: "수평 분할로 여러 파일 열기" },
    ],
  },
  {
    tool: "systemctl",
    subcommands: [
      { name: "start", description: "서비스 시작", flags: [{ flag: "--user", description: "사용자 서비스" }] },
      { name: "stop", description: "서비스 중지", flags: [] },
      { name: "restart", description: "서비스 재시작", flags: [] },
      { name: "status", description: "서비스 상태 확인", flags: [{ flag: "-l", description: "전체 로그" }] },
      { name: "enable", description: "부팅 시 자동 시작 활성화", flags: [{ flag: "--now", description: "즉시 시작도 함께" }] },
      { name: "disable", description: "자동 시작 비활성화", flags: [] },
      { name: "reload", description: "서비스 설정 재로드", flags: [] },
      { name: "list-units", description: "유닛 목록", flags: [{ flag: "--failed", description: "실패한 것만" }] },
    ],
    globalFlags: [
      { flag: "--user", description: "사용자 세션 서비스" },
      { flag: "--now", description: "enable/disable와 함께 즉시 시작/중지" },
      { flag: "-l", description: "줄 잘림 없이 전체 출력" },
      { flag: "--failed", description: "실패한 유닛만 표시" },
    ],
  },
  {
    tool: "journalctl",
    subcommands: [],
    globalFlags: [
      { flag: "-u", description: "특정 유닛 로그" },
      { flag: "-f", description: "실시간 팔로우" },
      { flag: "-n", description: "마지막 N줄" },
      { flag: "-b", description: "현재 부팅 이후 로그" },
      { flag: "--since", description: "시작 시간 지정" },
      { flag: "--until", description: "종료 시간 지정" },
      { flag: "-p", description: "우선순위 필터 (err, warning 등)" },
      { flag: "-xe", description: "에러 컨텍스트 + 페이저" },
    ],
  },
  {
    tool: "lsof",
    subcommands: [],
    globalFlags: [
      { flag: "-i", description: "네트워크 파일 (예: -i :8080)" },
      { flag: "-p", description: "특정 PID" },
      { flag: "-u", description: "특정 사용자" },
      { flag: "-t", description: "PID만 출력" },
      { flag: "-n", description: "호스트명 변환 안 함" },
      { flag: "+D", description: "디렉토리 내 파일 사용 프로세스" },
    ],
  },
  {
    tool: "netstat",
    subcommands: [],
    globalFlags: [
      { flag: "-tulnp", description: "TCP/UDP 리스닝 포트 + PID" },
      { flag: "-an", description: "모든 연결 + 숫자 주소" },
      { flag: "-r", description: "라우팅 테이블" },
      { flag: "-s", description: "프로토콜 통계" },
      { flag: "-p", description: "프로세스 정보" },
    ],
  },
  {
    tool: "scp",
    subcommands: [],
    globalFlags: [
      { flag: "-r", description: "디렉토리 재귀 복사" },
      { flag: "-P", description: "포트 지정" },
      { flag: "-i", description: "인증 키 파일" },
      { flag: "-C", description: "압축 전송" },
      { flag: "-q", description: "조용히 (진행률 숨김)" },
    ],
  },
];

// tool → spec index for fast lookup
const SPEC_INDEX = new Map<string, CliSpec>(CLI_SPECS.map((s) => [s.tool, s]));

export function getSpec(tool: string): CliSpec | undefined {
  return SPEC_INDEX.get(tool);
}
