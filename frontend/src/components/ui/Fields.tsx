import type { ComponentProps } from "react";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={"fb-input " + className} />;
}

export function NativeSelect({ className = "", children, ...props }: ComponentProps<"select">) {
  return (
    <span className="fb-select-shell">
      <select {...props} className={"fb-native-select " + className}>{children}</select>
      <svg className="fb-select-chevron" viewBox="0 0 18 18" aria-hidden="true">
        <path d="m4 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  );
}
