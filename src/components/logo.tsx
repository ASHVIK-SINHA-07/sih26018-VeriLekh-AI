/**
 * The VeriLekh wordmark — option C, chosen by the team on 12 Sept 2026.
 *
 * "Veri" in Latin and लेख in Devanagari under one continuous headline stroke,
 * the shirorekha: the name written the way the records it reads are written.
 * Kept as text rather than outlines, so it takes the fonts the app already
 * loads. The PNG exports in public/brand/ are for places without them.
 */
export function Logo({
  tone,
  className = "",
}: {
  /** The ground it sits on: the navy bar, or paper. */
  tone: "onDark" | "onLight";
  className?: string;
}) {
  const ink = tone === "onDark" ? "#ffffff" : "#1f3864";
  const accent = tone === "onDark" ? "#e0a15c" : "#c87941";
  return (
    <svg viewBox="0 0 220 52" className={className} role="img" aria-label="VeriLekh">
      <line x1="2" y1="8" x2="218" y2="8" stroke={ink} strokeWidth="4" />
      <text
        x="4"
        y="44"
        fill={ink}
        fontSize="36"
        fontWeight="600"
        style={{ fontFamily: "var(--font-serif), Lora, Georgia, serif", letterSpacing: 0 }}
      >
        Veri
      </text>
      <text
        x="94"
        y="45"
        fill={accent}
        fontSize="38"
        fontWeight="700"
        lang="hi"
        style={{ fontFamily: "var(--font-devanagari), 'Noto Sans Devanagari', sans-serif", letterSpacing: 0 }}
      >
        लेख
      </text>
    </svg>
  );
}
