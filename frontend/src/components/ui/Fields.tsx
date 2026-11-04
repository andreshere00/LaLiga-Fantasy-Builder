import type { ComponentProps } from "react";

/** Compose labels, descriptions and errors beside their control using stable IDs. */
export function Field({ className = "", ...props }: ComponentProps<"div">) {
  return <div data-slot="field" className={"fb-field " + className} {...props} />;
}

export function FieldLabel({ className = "", ...props }: ComponentProps<"label">) {
  return <label data-slot="field-label" className={"fb-field-label " + className} {...props} />;
}

export function FieldDescription({ className = "", ...props }: ComponentProps<"p">) {
  return <p data-slot="field-description" className={"fb-field-description " + className} {...props} />;
}

export function FieldError({ className = "", ...props }: ComponentProps<"p">) {
  return <p data-slot="field-error" role="alert" className={"fb-field-error " + className} {...props} />;
}

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
