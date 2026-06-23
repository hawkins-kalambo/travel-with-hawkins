import React from "react";

type IconProps = {
  className?: string;
  title?: string;
};

function SvgIcon({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : "presentation"}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconSearch({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <circle cx={11} cy={11} r={8} />
      <path d="m21 21-4.3-4.3" />
    </SvgIcon>
  );
}

export function IconMenu({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </SvgIcon>
  );
}

export function IconX({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </SvgIcon>
  );
}

export function IconChevronRight({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="m9 18 6-6-6-6" />
    </SvgIcon>
  );
}

export function IconCheck({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M20 6 9 17l-5-5" />
    </SvgIcon>
  );
}

export function IconDownload({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </SvgIcon>
  );
}

export function IconClipboard({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <rect x="9" y="2" width="6" height="4" />
      <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <rect x="7" y="8" width="10" height="8" rx="1" />
    </SvgIcon>
  );
}

export function IconPhone({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.86.32 1.7.59 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.11a2 2 0 0 1 2.11-.45c.8.27 1.64.47 2.5.59A2 2 0 0 1 22 16.92Z" />
    </SvgIcon>
  );
}

export function IconMail({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </SvgIcon>
  );
}

export function IconInfo({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </SvgIcon>
  );
}

export function IconShield({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="M9 12l2 2 4-4" />
    </SvgIcon>
  );
}

