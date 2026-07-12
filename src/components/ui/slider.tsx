import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export interface SliderAccessibleText {
  title?: string;
}

export function getSliderAccessibleText(input: {
  title?: string;
  ariaLabel?: string;
}): SliderAccessibleText {
  return {
    title: input.title ?? input.ariaLabel,
  };
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, title, ...props }, ref) => {
  const accessibleText = getSliderAccessibleText({
    title,
    ariaLabel: props["aria-label"],
  });

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[busy=true]:cursor-progress aria-[busy=true]:opacity-70",
        className,
      )}
      title={accessibleText.title}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/10">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-3 w-3 cursor-pointer rounded-full border border-accent bg-[#0d1117] shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
