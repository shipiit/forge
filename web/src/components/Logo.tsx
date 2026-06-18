export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FF8A3D" />
          <stop offset="1" stopColor="#FF4D67" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill="#0e1530" />
      <rect x="150" y="300" width="212" height="34" rx="10" fill="url(#lg-a)" />
      <path d="M168 210h190a30 30 0 0 1-30 36H230l-14 11h-34a12 12 0 0 1-12-12Z" fill="#E9EEFF" />
      <path d="M372 150l10 30 30 10-30 10-10 30-10-30-30-10 30-10z" fill="#7C5CFF" />
    </svg>
  );
}

/** Big animated hero mark (anvil bobbing, spark spinning). */
export function LogoHero() {
  return (
    <svg width="64%" viewBox="0 0 512 512" aria-label="ShipIT Forge">
      <defs>
        <linearGradient id="acc" x1="120" y1="300" x2="392" y2="360" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8A3D" />
          <stop offset="1" stopColor="#FF4D67" />
        </linearGradient>
        <linearGradient id="spk" x1="300" y1="120" x2="420" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <g className="animate-floaty" transform="translate(128,168)">
        <rect x="20" y="150" width="216" height="40" rx="12" fill="url(#acc)" />
        <path d="M36 70 H224 a32 32 0 0 1 -32 44 H96 l-16 12 H52 a14 14 0 0 1 -14 -14 V70 Z" fill="#E9EEFF" />
      </g>
      <g style={{ transformOrigin: '364px 184px' }} className="animate-spinslow" transform="translate(364,184)">
        <path d="M0 -44 l12 36 36 12 -36 12 -12 36 -12 -36 -36 -12 36 -12 Z" fill="url(#spk)" />
        <circle className="animate-dotpulse" cx="0" cy="0" r="10" fill="#fff" />
      </g>
    </svg>
  );
}
