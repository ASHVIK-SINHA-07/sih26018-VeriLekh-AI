/**
 * Multilingual fixture — a synthetic Maharashtra 7/12 extract (गाव नमुना ७/१२).
 * SYNTHETIC: invented names and survey numbers.
 *
 * Written into uploads/seed by the seed so the benchmark can read it through
 * the real OCR service. It is a benchmark fixture, not a document in the app:
 * its only job is to make the Marathi measurement reproducible — the figure
 * quoted for multilingual support must come from `npm run benchmark` like
 * every other number (CLAUDE.md D41).
 */

export const SATBARA_FILENAME = "satbara-pune-0084.svg";

/** What the page actually says. */
export const SATBARA_TRUTH: Record<string, string> = {
  district: "पुणे",
  tehsil: "हवेली",
  village: "वाघोली",
  khataNumber: "312",
  khasraNumber: "84/2",
  surveyNumber: "127",
  ownerName: "विठ्ठल शंकर पाटील",
  plotArea: "1.875",
  landClassification: "बागायत",
};

export const SATBARA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754">
  <rect width="1240" height="1754" fill="#f3ede1"/>
  <rect x="70" y="70" width="1100" height="1614" fill="none" stroke="#5a5246" stroke-width="3"/>
  <rect x="86" y="86" width="1068" height="1582" fill="none" stroke="#5a5246" stroke-width="1"/>
  <g font-family="Noto Sans Devanagari, sans-serif" fill="#2a2620">
    <text x="620" y="180" font-size="40" font-weight="600" text-anchor="middle">अधिकार अभिलेख — गाव नमुना ७/१२</text>
    <text x="620" y="222" font-size="21" text-anchor="middle">महसूल विभाग · महाराष्ट्र</text>
    <line x1="150" y1="250" x2="1090" y2="250" stroke="#8a8070" stroke-width="1"/>

    <text x="170" y="330" font-size="26">जिल्हा</text>       <text x="520" y="330" font-size="26">पुणे</text>
    <text x="170" y="392" font-size="26">तालुका</text>       <text x="520" y="392" font-size="26">हवेली</text>
    <text x="170" y="454" font-size="26">गाव</text>          <text x="520" y="454" font-size="26">वाघोली</text>
    <text x="170" y="516" font-size="26">वर्ष</text>          <text x="520" y="516" font-size="26">1431</text>

    <line x1="150" y1="560" x2="1090" y2="560" stroke="#8a8070" stroke-width="1"/>
    <text x="170" y="620" font-size="27" font-weight="600">जमीन तपशील</text>

    <text x="170" y="690" font-size="26">खाते क्रमांक</text>   <text x="520" y="690" font-size="26">312</text>
    <text x="170" y="752" font-size="26">गट क्रमांक</text>     <text x="520" y="752" font-size="26">84/2</text>
    <text x="170" y="814" font-size="26">सर्व्हे क्रमांक</text> <text x="520" y="814" font-size="26">127</text>
    <text x="170" y="876" font-size="26">मालकाचे नाव</text>   <text x="520" y="876" font-size="26">विठ्ठल शंकर पाटील</text>
    <text x="170" y="938" font-size="26">क्षेत्र (हे.)</text>   <text x="520" y="938" font-size="26">1.875</text>
    <text x="170" y="1000" font-size="26">जमीन प्रकार</text>   <text x="520" y="1000" font-size="26">बागायत</text>

    <line x1="150" y1="1050" x2="1090" y2="1050" stroke="#8a8070" stroke-width="1"/>
    <text x="170" y="1110" font-size="19">प्रमाणित करण्यात येते की वरील नोंद अभिलेखानुसार आहे.</text>
    <text x="170" y="1560" font-size="20">हस्ताक्षर — तलाठी</text>
  </g>
</svg>
`;
