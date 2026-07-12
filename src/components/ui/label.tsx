import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "cursor-default select-none text-sm font-medium leading-none text-white/78 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

export interface LabelAccessibleText {
  title?: string;
}

export function getLabelAccessibleText(input: {
  children?: React.ReactNode;
  title?: string;
}): LabelAccessibleText {
  return {
    title: input.title ?? (typeof input.children === "string" ? input.children : undefined),
  };
}

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, children, title, ...props }, ref) => {
  const accessibleText = getLabelAccessibleText({
    children,
    title,
  });

  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants(), className)}
      title={accessibleText.title}
      {...props}
    >
      {children}
    </LabelPrimitive.Root>
  );
});
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
