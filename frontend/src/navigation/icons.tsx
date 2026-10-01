import type { SVGProps } from 'react';

// Minimal hand-drawn line icons (no icon library dependency — only 2 nav
// items exist at MVP, not enough surface to justify a new package per the
// "simplest solution that works" principle).
function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function AccountIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.2-3.5 4.1-5.5 7.5-5.5s6.3 2 7.5 5.5" />
    </IconBase>
  );
}

export function ConnectionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M9 15 15 9" />
      <path d="M11 6.5 12.5 5a3 3 0 0 1 4.5 4L15.5 10.5" />
      <path d="M13 17.5 11.5 19a3 3 0 0 1-4.5-4L8.5 13.5" />
    </IconBase>
  );
}
