import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "secondary" | "muted" | "danger" | "danger-solid";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  muted: "btn-muted",
  danger: "btn-danger",
  "danger-solid": "btn-danger btn-danger--solid",
};

const DISABLED_CLASS = "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";

type CommonProps = {
  variant?: Variant;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, "className" | "children"> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children"> & {
    href: string;
  };

type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * Wraps the existing .btn-primary/.btn-secondary/.btn-muted/.btn-danger
 * classes from globals.css so every page uses the same button styling
 * instead of one-off Tailwind class combinations. Renders a real <button>
 * by default, or a Next <Link> when `href` is supplied.
 */
export default function Button({ variant = "primary", className = "", children, ...rest }: ButtonProps) {
  const classes = `${VARIANT_CLASS[variant]} ${DISABLED_CLASS} ${className}`.trim();

  if ("href" in rest && rest.href) {
    const { href, ...linkRest } = rest as ButtonAsLink;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {children}
      </Link>
    );
  }

  const buttonRest = rest as Omit<ButtonAsButton, "href" | "variant" | "className" | "children">;
  return (
    <button type="button" className={classes} {...buttonRest}>
      {children}
    </button>
  );
}
