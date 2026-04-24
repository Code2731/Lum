export type TokenType = "keyword" | "command" | "option" | "variable" | "string" | "operator" | "path" | "text";

export interface Token {
  text: string;
  type: TokenType;
}

const KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "while", "do", "done",
  "case", "esac", "in", "return", "export", "local", "readonly", "declare",
  "source", "alias", "unset", "true", "false", "function", "echo", "eval",
  "set", "shift", "break", "continue", "exit", "trap", "wait", "exec",
  "cd", "pushd", "popd", "read", "printf",
]);

export const TOKEN_COLORS: Record<TokenType, string> = {
  keyword:  "#ff7b72",
  command:  "#79c0ff",
  option:   "#3fb950",
  variable: "#d2a8ff",
  string:   "#a5d6ff",
  operator: "#ff7b72",
  path:     "#e3b341",
  text:     "#c9d1d9",
};

export function tokenizeShell(input: string): Token[] {
  if (!input) return [];

  const tokens: Token[] = [];
  let i = 0;
  let isCommandPos = true;

  while (i < input.length) {
    const ch = input[i];

    // Whitespace
    if (ch === " " || ch === "\t") {
      let j = i + 1;
      while (j < input.length && (input[j] === " " || input[j] === "\t")) j++;
      tokens.push({ text: input.slice(i, j), type: "text" });
      i = j;
      continue;
    }

    const rest = input.slice(i);

    // Operators: ||, &&, >>, <<, |, &, ;, >, <
    const opM = rest.match(/^(\|\||&&|>>|<<|[|&;><])/);
    if (opM) {
      tokens.push({ text: opM[0], type: "operator" });
      i += opM[0].length;
      isCommandPos = true;
      continue;
    }

    // Variable
    if (ch === "$") {
      const m = rest.match(/^\$(\{[^}]*\}|\w+|[#@*?!0-9])?/);
      if (m) {
        tokens.push({ text: m[0], type: "variable" });
        i += m[0].length;
        continue;
      }
    }

    // Single-quoted string
    if (ch === "'") {
      const end = rest.indexOf("'", 1);
      const str = end === -1 ? rest : rest.slice(0, end + 1);
      tokens.push({ text: str, type: "string" });
      i += str.length;
      continue;
    }

    // Double-quoted string
    if (ch === '"') {
      let j = 1;
      while (j < rest.length && rest[j] !== '"') {
        if (rest[j] === "\\") j++;
        j++;
      }
      tokens.push({ text: rest.slice(0, j + 1), type: "string" });
      i += j + 1;
      continue;
    }

    // Option: -x, --flag (not just a lone dash)
    if (ch === "-" && rest.length > 1 && rest[1] !== " ") {
      const m = rest.match(/^-{1,2}[\w-]*/);
      if (m) {
        tokens.push({ text: m[0], type: "option" });
        i += m[0].length;
        continue;
      }
    }

    // Path: ~/, ./, ../, /
    if (/^(?:~\/|\.\.?\/|\/)/.test(rest)) {
      const m = rest.match(/^[^\s|&;><'"$]+/);
      if (m) {
        tokens.push({ text: m[0], type: "path" });
        i += m[0].length;
        isCommandPos = false;
        continue;
      }
    }

    // Word: command, keyword, or plain text
    const wordM = rest.match(/^[^\s|&;><'"$]+/);
    if (wordM) {
      const word = wordM[0];
      let type: TokenType;
      if (KEYWORDS.has(word)) {
        type = "keyword";
      } else if (isCommandPos) {
        type = "command";
        isCommandPos = false;
      } else {
        type = "text";
      }
      tokens.push({ text: word, type });
      i += word.length;
      continue;
    }

    tokens.push({ text: ch, type: "text" });
    i++;
  }

  return tokens;
}
