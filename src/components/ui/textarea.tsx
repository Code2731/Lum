import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaAccessibleText {
  title?: string;
}

export function getTextareaAccessibleText(input: {
  title?: string;
  placeholder?: string;
  ariaLabel?: string;
}): TextareaAccessibleText {
  return {
    title: input.title ?? input.placeholder ?? input.ariaLabel,
  };
}

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, title, placeholder, ...props }, ref) => {
    const accessibleText = getTextareaAccessibleText({
      title,
      placeholder,
      ariaLabel: props["aria-label"],
    });

    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded bg-white/5 border border-white/10 px-2.5 py-1.5",
          "text-xs text-white/80 placeholder:text-white/25",
          "outline-none resize-none transition-colors",
          "focus:border-accent/60 focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-white/[0.03]",
          "aria-[invalid=true]:border-red-400/45 aria-[invalid=true]:bg-red-500/[0.06] aria-[invalid=true]:text-red-100",
          className
        )}
        title={accessibleText.title}
        placeholder={placeholder}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
