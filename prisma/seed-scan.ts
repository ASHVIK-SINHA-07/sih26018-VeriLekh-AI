/**
 * Generates synthetic "scanned" khatauni pages for the seed data.
 *
 * These are SVG, drawn in code — no image files are committed and no image
 * library is added. They exist so the verification screen (T7) has a real
 * document to show in its left pane, and so the demo shows Devanagari source
 * text rather than an empty box.
 *
 * Every value drawn here is invented. See docs/01_PRD.md: never render a real
 * citizen's ownership record.
 */

export interface ScanFields {
  district: string;
  tehsil: string;
  village: string;
  khataNumber: string;
  khasraNumber: string;
  surveyNumber: string;
  ownerName: string;
  plotArea: string;
  landClassification: string;
  fasliYear: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fields listed in `faded` are drawn faint and slightly blurred — this is the
 * visible reason their confidence score is low, so a reviewer can see on the
 * scan why the pipeline was unsure.
 */
export function renderKhatauniScan(
  fields: ScanFields,
  faded: string[] = [],
  seed = 1,
): string {
  const isFaded = (name: string) => faded.includes(name);
  const style = (name: string) =>
    isFaded(name)
      ? ` opacity="0.42" filter="url(#smudge)"`
      : ` opacity="0.88"`;

  // Deterministic per-document skew so the pages don't look identical.
  const tilt = (((seed * 37) % 9) - 4) / 10;
  const speckles = Array.from({ length: 60 }, (_, i) => {
    const x = ((seed * 71 + i * 137) % 780) + 20;
    const y = ((seed * 53 + i * 211) % 1020) + 30;
    const r = ((seed + i) % 3) * 0.5 + 0.4;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#5b4a35" opacity="0.16"/>`;
  }).join("");

  const row = (label: string, value: string, name: string, y: number) => `
    <text x="70" y="${y}" font-size="17" fill="#2b2b2b" opacity="0.75">${esc(label)}</text>
    <text x="300" y="${y}" font-size="18" fill="#1a2b4a"${style(name)}>${esc(value)}</text>
    <line x1="295" y1="${y + 7}" x2="770" y2="${y + 7}" stroke="#8a8272" stroke-width="0.7" opacity="0.5"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1100" viewBox="0 0 840 1100">
  <defs>
    <filter id="smudge"><feGaussianBlur stdDeviation="0.9"/></filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${seed}"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.07"/></feComponentTransfer>
      <feComposite operator="in" in2="SourceGraphic"/>
    </filter>
  </defs>

  <rect width="840" height="1100" fill="#efe9dc"/>
  <rect width="840" height="1100" fill="#c9bfa6" filter="url(#grain)"/>

  <g transform="rotate(${tilt} 420 550)" font-family="'Noto Sans Devanagari','Devanagari MT','Kohinoor Devanagari',sans-serif">
    <rect x="40" y="40" width="760" height="1020" fill="none" stroke="#4a4436" stroke-width="2" opacity="0.65"/>
    <rect x="52" y="52" width="736" height="996" fill="none" stroke="#4a4436" stroke-width="0.8" opacity="0.4"/>

    <text x="420" y="110" text-anchor="middle" font-size="27" fill="#1a2b4a" opacity="0.9">अधिकार अभिलेख — खतौनी</text>
    <text x="420" y="140" text-anchor="middle" font-size="15" fill="#3a3a3a" opacity="0.65">राजस्व विभाग · उत्तर प्रदेश</text>
    <line x1="70" y1="160" x2="770" y2="160" stroke="#4a4436" stroke-width="1.2" opacity="0.55"/>

    ${row("जिला", fields.district, "district", 210)}
    ${row("तहसील", fields.tehsil, "tehsil", 260)}
    ${row("ग्राम", fields.village, "village", 310)}
    ${row("फसली वर्ष", fields.fasliYear, "fasliYear", 360)}

    <line x1="70" y1="400" x2="770" y2="400" stroke="#4a4436" stroke-width="1" opacity="0.45"/>
    <text x="70" y="440" font-size="19" fill="#1a2b4a" opacity="0.85">भूमि विवरण</text>

    ${row("खाता संख्या", fields.khataNumber, "khataNumber", 495)}
    ${row("खसरा संख्या", fields.khasraNumber, "khasraNumber", 545)}
    ${row("सर्वे संख्या", fields.surveyNumber, "surveyNumber", 595)}
    ${row("स्वामी का नाम", fields.ownerName, "ownerName", 645)}
    ${row("क्षेत्रफल (हे.)", fields.plotArea, "plotArea", 695)}
    ${row("भूमि वर्ग", fields.landClassification, "landClassification", 745)}

    <line x1="70" y1="800" x2="770" y2="800" stroke="#4a4436" stroke-width="1" opacity="0.45"/>
    <text x="70" y="845" font-size="14" fill="#3a3a3a" opacity="0.6">प्रमाणित किया जाता है कि उपरोक्त प्रविष्टि अभिलेख के अनुसार है।</text>

    <circle cx="640" cy="930" r="62" fill="none" stroke="#7a2f2f" stroke-width="2.5" opacity="0.4"/>
    <circle cx="640" cy="930" r="52" fill="none" stroke="#7a2f2f" stroke-width="1" opacity="0.35"/>
    <text x="640" y="922" text-anchor="middle" font-size="13" fill="#7a2f2f" opacity="0.5">राजस्व</text>
    <text x="640" y="942" text-anchor="middle" font-size="13" fill="#7a2f2f" opacity="0.5">कार्यालय</text>

    <line x1="90" y1="960" x2="330" y2="960" stroke="#2b2b2b" stroke-width="0.9" opacity="0.5"/>
    <text x="90" y="985" font-size="14" fill="#3a3a3a" opacity="0.6">हस्ताक्षर — लेखपाल</text>

    ${speckles}
  </g>
</svg>`;
}
