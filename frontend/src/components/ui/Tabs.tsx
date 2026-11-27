// Adapted from shadcn/ui's Base UI Tabs (MIT). See shadcn-LICENSE.md.
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { ComponentProps, JSXElementConstructor } from "react";
import "./Tabs.css";

type WithClass<T extends JSXElementConstructor<any>> = Omit<ComponentProps<T>, "className"> & { className?: string };

export function Tabs({ className = "", ...props }: WithClass<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={`fb-tabs ${className}`} {...props} />;
}

export function TabsList({ className = "", ...props }: WithClass<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List data-slot="tabs-list" className={`fb-tabs-list ${className}`} {...props} />;
}

export function TabsTab({ className = "", ...props }: WithClass<typeof TabsPrimitive.Tab>) {
  return <TabsPrimitive.Tab data-slot="tabs-tab" className={`fb-tabs-tab ${className}`} {...props} />;
}

export function TabsPanel({ className = "", ...props }: WithClass<typeof TabsPrimitive.Panel>) {
  return <TabsPrimitive.Panel data-slot="tabs-panel" className={`fb-tabs-panel ${className}`} {...props} />;
}
