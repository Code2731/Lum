import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputAccessibleText {
  title?: string;
}

export function getInputAccessibleText(input: {
  title?: string;
  placeholder?: string;
  ariaLabel?: string;
}): InputAccessibleText {
  return {
    title: input.title ?? input.placeholder ?? input.ariaLabel,
  };
}

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, title, placeholder, ...props }, ref) => {
    const accessibleText = getInputAccessibleText({
      title,
      placeholder,
      ariaLabel: props["aria-label"],
    });

    return (
      <input
        type={type}
        className={cn(
          "w-full rounded border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/25 transition-colors",
          "focus:border-accent/50 focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-white/[0.03]",
          "aria-[invalid=true]:border-red-400/45 aria-[invalid=true]:bg-red-500/[0.06] aria-[invalid=true]:text-red-100",
          className,
        )}
        title={accessibleText.title}
        ref={ref}
        placeholder={placeholder}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
