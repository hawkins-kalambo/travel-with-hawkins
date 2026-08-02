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

export function IconWhatsApp({ className, title }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : "presentation"}
      className={className}
      fill="currentColor"
    >
      {title ? <title>{title}</title> : null}
      <path d="M16.04 3A12.9 12.9 0 0 0 5.02 22.62L3 29l6.56-1.93A12.98 12.98 0 1 0 16.04 3Zm0 23.76c-2.1 0-4.13-.61-5.87-1.76l-.42-.25-3.89 1.14 1.16-3.79-.28-.44a10.76 10.76 0 1 1 9.3 5.1Zm5.9-8.05c-.32-.16-1.91-.94-2.21-1.05-.29-.11-.5-.16-.72.16-.21.32-.82 1.05-1.01 1.27-.18.21-.37.24-.69.08-.32-.16-1.36-.5-2.58-1.6a9.68 9.68 0 0 1-1.79-2.22c-.19-.32-.02-.49.14-.65.15-.14.32-.37.48-.56.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.08-1.11 2.64 0 1.56 1.14 3.07 1.3 3.28.16.21 2.24 3.42 5.42 4.8.76.32 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.91-.78 2.18-1.53.27-.75.27-1.4.19-1.53-.08-.13-.29-.21-.61-.37Z" />
    </svg>
  );
}

export function IconRoute({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M6 16V8a3 3 0 0 1 3-3h6" />
      <path d="m14 13 3 3-3 3" />
    </SvgIcon>
  );
}

export function IconTicket({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 11v2" />
      <path d="M13 17v2" />
    </SvgIcon>
  );
}

export function IconClock({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </SvgIcon>
  );
}

export function IconBell({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </SvgIcon>
  );
}

export function IconCalendar({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </SvgIcon>
  );
}

export function IconUser({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </SvgIcon>
  );
}

export function IconUsers({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </SvgIcon>
  );
}

export function IconBus({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
      <path d="M4 11h16" />
      <circle cx="7.5" cy="18.5" r="1.5" />
      <circle cx="16.5" cy="18.5" r="1.5" />
    </SvgIcon>
  );
}

export function IconMapPin({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </SvgIcon>
  );
}

export function IconDollar({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M12 2v20" />
      <path d="M17 5.5c0-1.4-2.2-2.5-5-2.5s-5 1.1-5 2.5S9.2 8 12 8s5 1.1 5 2.5-2.2 2.5-5 2.5-5-1.1-5-2.5" />
    </SvgIcon>
  );
}

export function IconHeadset({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2Z" />
      <path d="M3 15a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2Z" />
      <path d="M18 19a3 3 0 0 1-3 2h-2" />
    </SvgIcon>
  );
}

export function IconChevronDown({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="m6 9 6 6 6-6" />
    </SvgIcon>
  );
}

export function IconPrinter({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </SvgIcon>
  );
}

export function IconShare({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-3.9" />
      <path d="m8.6 13.5 6.8 3.9" />
    </SvgIcon>
  );
}

export function IconAlertCircle({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </SvgIcon>
  );
}

export function IconInbox({ className, title }: IconProps) {
  return (
    <SvgIcon className={className} title={title}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </SvgIcon>
  );
}

export function IconStar({ className, title }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : "presentation"}
      className={className}
      fill="currentColor"
    >
      {title ? <title>{title}</title> : null}
      <path d="m12 2 2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7-5.4-4.7 7.1-.7Z" />
    </svg>
  );
}

