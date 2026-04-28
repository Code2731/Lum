import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn/ui 표준 헬퍼 — Tailwind 클래스를 안전하게 합치고 충돌 해소.
 * 예: cn("px-4 px-6", isActive && "bg-blue-500") → "px-6 bg-blue-500"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
