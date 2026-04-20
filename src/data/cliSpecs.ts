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
];

// tool → spec index for fast lookup
const SPEC_INDEX = new Map<string, CliSpec>(CLI_SPECS.map((s) => [s.tool, s]));

export function getSpec(tool: string): CliSpec | undefined {
  return SPEC_INDEX.get(tool);
}
