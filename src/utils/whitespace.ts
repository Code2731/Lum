export const WHITESPACE = /\p{White_Space}/u;
export const LEADING_WHITESPACE = /^[\p{White_Space}]+/u;
export const REPEATED_WHITESPACE = /[\p{White_Space}]+/gu;
export const TRIM_WHITESPACE = /^[\p{White_Space}]+|[\p{White_Space}]+$/gu;

export function trimWhitespace(raw: string): string {
  return raw.replace(TRIM_WHITESPACE, "");
}

export function trimWhitespaceStart(raw: string): string {
  return raw.replace(LEADING_WHITESPACE, "");
}

export function collapseWhitespace(raw: string): string {
  return trimWhitespace(raw).replace(REPEATED_WHITESPACE, " ");
}

export function hasVisibleText(raw: string): boolean {
  return trimWhitespace(raw).length > 0;
}
