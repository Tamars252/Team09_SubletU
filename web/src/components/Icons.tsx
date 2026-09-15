type IconProps = { size?: number; strokeWidth?: number; className?: string };

function svg(path: React.ReactNode, filled = false) {
  return function Icon({ size = 22, strokeWidth = 2, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}

export const IconCards = svg(
  <>
    <rect x="3" y="6" width="13" height="15" rx="2.5" />
    <path d="M8 3h9a2.5 2.5 0 0 1 2.5 2.5V16" />
  </>,
);

export const IconMap = svg(
  <>
    <path d="M9 20 3 22V6l6-2 6 2 6-2v16l-6 2-6-2Z" />
    <path d="M9 4v16M15 6v16" />
  </>,
);

export const IconHeart = svg(
  <path d="M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.3-8.5 11.3Z" />,
);

export const IconHeartFilled = svg(
  <path d="M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.3-8.5 11.3Z" />,
  true,
);

export const IconChat = svg(
  <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-2.9-.4L4 21l1.4-4.1A8.3 8.3 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 9 8.4Z" />,
);

export const IconPlus = svg(<path d="M12 5v14M5 12h14" />);

export const IconX = svg(<path d="M18 6 6 18M6 6l12 12" />);

export const IconCheck = svg(<path d="m20 6-11 11-5-5" />);

export const IconStar = svg(
  <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  true,
);

export const IconSliders = svg(
  <>
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="9" cy="6" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="8" cy="18" r="2.2" fill="currentColor" stroke="none" />
  </>,
);

export const IconSearch = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);

export const IconUser = svg(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);

export const IconArrowLeft = svg(<path d="M19 12H5m6-7-7 7 7 7" />);

export const IconSend = svg(<path d="M4 12 21 4l-8 17-2-7-7-2Z" />);

export const IconRewind = svg(
  <>
    <path d="M3 8a9 9 0 1 1-1.5 5" />
    <path d="M3 3v5h5" />
  </>,
);

export const IconPin = svg(
  <>
    <path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12Z" />
    <circle cx="12" cy="10" r="2.6" />
  </>,
);

export const IconBed = svg(
  <>
    <path d="M3 18v-7h18v7M3 11V7M21 18v2M3 18v2" />
    <path d="M7 11V9h5v2" />
  </>,
);

export const IconBath = svg(
  <>
    <path d="M4 12h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4Z" />
    <path d="M7 12V6a2 2 0 0 1 4 0" />
  </>,
);

export const IconFlag = svg(
  <>
    <path d="M5 21V4h9l-1 3h7l-2 5 2 5h-9l-1-3H5" />
  </>,
);

export const IconGear = svg(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </>,
);

export const IconArchive = svg(
  <>
    <rect x="3" y="4" width="18" height="4.5" rx="1.2" />
    <path d="M5 8.5V20h14V8.5M10 13h4" />
  </>,
);

export const IconCamera = svg(
  <>
    <path d="M3 8.5A2 2 0 0 1 5 6.5h1.8l1.4-2h7.6l1.4 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" />
    <circle cx="12" cy="13" r="3.4" />
  </>,
);

export const IconLogout = svg(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 16 4-4-4-4M20 12H9" />
  </>,
);

export const IconShield = svg(
  <>
    <path d="M12 22s8-3.6 8-10V5.5L12 2 4 5.5V12c0 6.4 8 10 8 10Z" />
    <path d="m8.8 12 2.2 2.2 4.2-4.4" />
  </>,
);

export const IconLocate = svg(
  <>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
  </>,
);

/**
 * Microsoft's four-square mark. Drawn rather than pulled from a CDN because
 * the brand guidelines require the exact colours, and an external image would
 * be one more thing that can fail to load on the sign-in screen.
 */
export function MicrosoftMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 23 23" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}
