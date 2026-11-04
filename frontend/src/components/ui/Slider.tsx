import { copy as localizeCopy, useLanguage } from "../../i18n";
// Adapted from shadcn/ui's Base UI Slider (MIT). See shadcn-LICENSE.md.
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import type { ComponentProps } from "react";
import "./Slider.css";

type SliderProps = Omit<ComponentProps<typeof SliderPrimitive.Root>, "className"> & {
  className?: string;
  thumbLabels: readonly string[];
};

/** Single or range slider. Renders one labelled thumb per entry in `thumbLabels`. */
export function Slider({ className = "", thumbLabels, ...props }: SliderProps) {
  useLanguage();
  return (
    <SliderPrimitive.Root data-slot="slider" className={`fb-slider ${className}`} {...props}>
      <SliderPrimitive.Control data-slot="slider-control" className="fb-slider-control">
        <SliderPrimitive.Track data-slot="slider-track" className="fb-slider-track">
          <SliderPrimitive.Indicator data-slot="slider-range" className="fb-slider-range" />
          {thumbLabels.map((label, index) => (
            <SliderPrimitive.Thumb key={label} index={index} aria-label={localizeCopy(label)}
              data-slot="slider-thumb" className="fb-slider-thumb" />
          ))}
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
