// Adapted from shadcn/ui's Base UI Toggle Group (MIT). See shadcn-LICENSE.md.
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import type { ComponentProps } from "react";
import "./ToggleGroup.css";

type ToggleGroupProps = Omit<ComponentProps<typeof ToggleGroupPrimitive>, "className"> & {
  className?: string;
};

export function ToggleGroup({ className = "", ...props }: ToggleGroupProps) {
  return <ToggleGroupPrimitive data-slot="toggle-group"
    className={`fb-toggle-group ${className}`} {...props} />;
}

type ToggleGroupItemProps = Omit<ComponentProps<typeof TogglePrimitive>, "className"> & {
  className?: string;
};

export function ToggleGroupItem({ className = "", ...props }: ToggleGroupItemProps) {
  return <TogglePrimitive data-slot="toggle-group-item"
    className={`fb-toggle-group-item ${className}`} {...props} />;
}
