/** Theme-native field markings retain the original pitch coordinate system. */
export function PitchMarkings() {
  return (
    <svg className="pitch-markings" viewBox="0 0 611 761" aria-hidden="true">
      <g fill="none" stroke="var(--fb-line)" strokeWidth="1.5">
        <rect x="6" y="2" width="600" height="750" />
        <path d="M6 377h600" />
        <circle cx="306" cy="377" r="68" />
        <circle cx="306" cy="377" r="3" fill="var(--fb-line)" />
        <path d="M140 2v115h332V2M230 2v42h152V2M140 752V637h332v115M230 752v-42h152v42" />
      </g>
    </svg>
  );
}
