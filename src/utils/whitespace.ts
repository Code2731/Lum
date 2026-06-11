export const WHITESPACE = /\p{White_Space}/u;
export const LEADING_WHITESPACE = /^[\p{White_Space}]+/u;
export const TRIM_WHITESPACE = /^[\p{White_Space}]+|[\p{White_Space}]+$/gu;

export function trimWhitespace(raw: string): string {
  return raw.replace(TRIM_WHITESPACE, "");
}

export function trimWhitespaceStart(raw: string): string {
  return raw.replace(LEADING_WHITESPACE, "");
}
