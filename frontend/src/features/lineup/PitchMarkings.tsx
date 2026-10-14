/** Theme-native field markings retain the original pitch coordinate system. */
export function PitchMarkings({ stretch = false }: { stretch?: boolean }) {
  return (
    <svg className="pitch-markings" viewBox="0 0 611 761" aria-hidden="true"
      preserveAspectRatio={stretch ? "none" : undefined}>
      <g fill="none" stroke="var(--fb-line)" strokeWidth="1.5">
        <rect x="0.75" y="0.75" width="609.5" height="759.5" />
        <path d="M0.75 380.5h609.5" />
        <circle cx="305.5" cy="380.5" r="68" />
        <circle cx="305.5" cy="380.5" r="3" fill="var(--fb-line)" />
        <path d="M139.5 0.75v115h332V0.75M229.5 0.75v42h152V0.75M139.5 760.25v-115h332v115M229.5 760.25v-42h152v42" />
      </g>
    </svg>
  );
}
