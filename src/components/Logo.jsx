export default function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="brand-mark" style={{ borderRadius: 0 }}>
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--green)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="22" fill="url(#logoGrad)" />
      <g fill="#fff">
        <circle cx="50" cy="50" r="27" />
        <rect x="42" y="2" width="16" height="17" rx="3" />
        <rect x="42" y="2" width="16" height="17" rx="3" transform="rotate(45 50 50)" />
        <rect x="42" y="2" width="16" height="17" rx="3" transform="rotate(90 50 50)" />
        <rect x="42" y="2" width="16" height="17" rx="3" transform="rotate(135 50 50)" />
        <rect x="42" y="2" width="16" height="17" rx="3" transform="rotate(180 50 50)" />
        <rect x="42" y="2" width="16" height="17" rx="3" transform="rotate(225 50 50)" />
        <rect x="42" y="2" width="16" height="17" rx="3" transform="rotate(270 50 50)" />
        <rect x="42" y="2" width="16" height="17" rx="3" transform="rotate(315 50 50)" />
      </g>
      <circle cx="50" cy="50" r="11" fill="#241a0f" />
    </svg>
  )
}
