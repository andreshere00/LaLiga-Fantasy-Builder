import type { ComponentProps, ReactNode } from "react";

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "default" | "lg" | "icon";
export type ButtonShape = "rounded" | "square";

type VariantOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  className?: string;
};

/** Class helper also usable on React Router links, keeping link semantics. */
export function buttonVariants({
  variant = "default", size = "default", shape = "rounded", className = "",
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
  loadingLabel = "Saving…", disabled, children, type = "button", ...props
}: ButtonProps) {
  return (
    <button {...props} type={type} disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonVariants({ variant, size, shape, className })}>
      {loading ? <span className="fb-button-spinner" aria-hidden="true" /> :
        icon ? <span className="fb-button-icon" aria-hidden="true">{icon}</span> : null}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}
