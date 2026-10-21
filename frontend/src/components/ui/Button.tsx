import type { ComponentProps, ReactNode } from "react";

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "default" | "lg" | "icon";
export type ButtonShape = "square";

type VariantOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  className?: string;
};

/** Class helper also usable on React Router links, keeping link semantics. */
export function buttonVariants({
  variant = "default", size = "default", shape = "square", className = "",
}: VariantOptions = {}) {
  return `fb-button fb-button--${variant} fb-button--${size} fb-button--${shape} ${className}`;
}

export type ButtonProps = ComponentProps<"button"> & VariantOptions & {
  icon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
};

/** Native React 19 button; the ref prop passes directly through to the DOM. */
export function Button({
  variant, size, shape, className, icon, loading = false,
  loadingLabel = "Working…", disabled, children, type = "button", onClick, ...props
}: ButtonProps) {
  const unavailable = disabled || loading || props["aria-disabled"] === true ||
    props["aria-disabled"] === "true";
  return (
    <button {...props} type={type} disabled={disabled || loading}
      aria-busy={loading || props["aria-busy"]}
      onClick={(event) => {
        if (unavailable) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
      className={buttonVariants({ variant, size, shape, className })}>
      {loading ? <span className="fb-button-spinner" aria-hidden="true" /> :
        icon ? <span className="fb-button-icon" aria-hidden="true">{icon}</span> : null}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}
