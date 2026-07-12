import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

export interface SwitchAccessibleText {
  title?: string;
}

export function getSwitchAccessibleText(input: {
  title?: string;
  ariaLabel?: string;
}): SwitchAccessibleText {
  return {
    title: input.title ?? input.ariaLabel,
  };
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, title, ...props }, ref) => {
  const accessibleText = getSwitchAccessibleText({
    title,
    ariaLabel: props["aria-label"],
  });

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[busy=true]:cursor-progress aria-[busy=true]:opacity-70",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className,
      )}
      title={accessibleText.title}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
