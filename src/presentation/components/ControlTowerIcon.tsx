export function ControlTowerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Antenna */}
      <line x1="10" y1="1" x2="10" y2="3.5" />
      {/* Observation cabin */}
      <rect x="5" y="3.5" width="10" height="4.5" rx="1" />
      {/* Two parallel pillars */}
      <line x1="7.5" y1="8" x2="7.5" y2="18.5" />
      <line x1="12.5" y1="8" x2="12.5" y2="18.5" />
      {/* Base foot */}
      <line x1="6" y1="18.5" x2="14" y2="18.5" />
    </svg>
  )
}
