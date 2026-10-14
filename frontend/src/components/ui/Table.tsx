// Adapted from shadcn/ui (MIT). See shadcn-LICENSE.md.
import type { ComponentProps } from "react";
import "./StandingsPrimitives.css";

/** The enclosing ScrollArea owns overflow, including sticky table headers. */
export function Table({ className = "", ...props }: ComponentProps<"table">) {
  return <table data-slot="table" className={`fb-table ${className}`} {...props} />;
}

export function TableHeader(props: ComponentProps<"thead">) {
  return <thead data-slot="table-header" {...props} />;
}

export function TableBody(props: ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" {...props} />;
}

export function TableRow(props: ComponentProps<"tr">) {
  return <tr data-slot="table-row" {...props} />;
}

export function TableHead(props: ComponentProps<"th">) {
  return <th data-slot="table-head" scope="col" {...props} />;
}

export function TableCell(props: ComponentProps<"td">) {
  return <td data-slot="table-cell" {...props} />;
}

export function TableCaption(props: ComponentProps<"caption">) {
  return <caption data-slot="table-caption" {...props} />;
}
