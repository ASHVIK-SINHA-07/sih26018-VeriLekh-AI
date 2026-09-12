/**
 * Synthetic दाखिल-खारिज orders — SYNTHETIC, like everything in the seed.
 *
 * Unlike the khatauni records, these are not seeded as already-extracted
 * rows. Each is rendered as a scan and queued, and the worker reads it with
 * the real OCR service — so what the review screen shows for an order is what
 * the pipeline actually read off the page, not what the seed claimed it read.
 *
 *   1204/2026  Lucknow 58/1   — सुनीता देवी मिश्रा sells the parcel again in
 *              2026, but she sold it to अनिल कुमार मिश्रा in 2025. Caught at
 *              intake as a double sale, before it can enter the register.
 *   1318/2026  Varanasi 142/3 — a sound gift of half the parcel from राजेश
 *              कुमार वर्मा to अमित वर्मा. Approving it updates the chain, and
 *              the Record of Rights then needs updating to match.
 *   0412/2026  Gorakhpur 91/4 — a parcel with no digitised history. Approving
 *              this 2009 sale begins its chain; the seller's earlier title is
 *              presumed and flagged as untraced.
 */

export interface SeedMutationOrder {
  filename: string;
  mutationNumber: string;
  orderDate: string;       // DD/MM/YYYY, as printed
  district: string;
  tehsil: string;
  village: string;
  khasraNumber: string;
  mutationType: string;    // as printed: विक्रय / वरासत / दान …
  fromOwner: string;
  toOwner: string;
  share: string;           // as printed: 1/2 or सम्पूर्ण
  deedNumber?: string;
  note: string;
}

export const SEED_MUTATION_ORDERS: SeedMutationOrder[] = [
  {
    filename: "order-lucknow-1204.svg",
    mutationNumber: "1204/2026", orderDate: "14/08/2026",
    district: "लखनऊ", tehsil: "मलिहाबाद", village: "भगवंतपुर", khasraNumber: "58/1",
    mutationType: "विक्रय", fromOwner: "सुनीता देवी मिश्रा", toOwner: "रवि शंकर पाण्डेय",
    share: "सम्पूर्ण", deedNumber: "9012/2026",
    note: "PLANTED — double sale: the seller already sold this parcel in 2025",
  },
  {
    filename: "order-varanasi-1318.svg",
    mutationNumber: "1318/2026", orderDate: "02/09/2026",
    district: "वाराणसी", tehsil: "पिंडरा", village: "रामपुर खुर्द", khasraNumber: "142/3",
    mutationType: "दान", fromOwner: "राजेश कुमार वर्मा", toOwner: "अमित वर्मा",
    share: "1/2", deedNumber: "4470/2026",
    note: "sound gift of half the parcel — approve it to watch the chain update",
  },
  {
    filename: "order-gorakhpur-0412.svg",
    mutationNumber: "412/2009", orderDate: "11/05/2009",
    district: "गोरखपुर", tehsil: "सदर", village: "चांदपुर", khasraNumber: "91/4",
    mutationType: "विक्रय", fromOwner: "हरि प्रसाद सिंह", toOwner: "अनिल कुमार सिंह",
    share: "सम्पूर्ण", deedNumber: "1133/2009",
    note: "first order for a parcel with no digitised history — begins its chain",
  },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Render an order as a scan. Same visual language as the khatauni scans —
 * a printed government form on aged paper — with labels in a left column and
 * values in a right one, which is how the OCR service reads lines best.
 */
export function renderMutationOrderScan(o: SeedMutationOrder): string {
  const rows: [string, string][] = [
    ["दाखिल खारिज संख्या", o.mutationNumber],
    ["आदेश दिनांक", o.orderDate],
    ["जिला", o.district],
    ["तहसील", o.tehsil],
    ["ग्राम", o.village],
    ["खसरा संख्या", o.khasraNumber],
    ["अंतरण का प्रकार", o.mutationType],
    ["हस्तांतरणकर्ता", o.fromOwner],
    ["प्राप्तकर्ता", o.toOwner],
    ["अंतरित अंश", o.share],
    ...(o.deedNumber ? [["विलेख संख्या", o.deedNumber] as [string, string]] : []),
  ];

  const lines = rows.map(([label, value], i) => {
    const y = 330 + i * 64;
    return `<text x="170" y="${y}" font-size="26">${esc(label)}</text>` +
      `<text x="560" y="${y}" font-size="26">${esc(value)}</text>` +
      `<line x1="540" y1="${y + 12}" x2="1070" y2="${y + 12}" stroke="#b9ae9a" stroke-width="1"/>`;
  }).join("\n    ");

  const footerY = 330 + rows.length * 64 + 60;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754">
  <rect width="1240" height="1754" fill="#f3ede1"/>
  <rect x="70" y="70" width="1100" height="1614" fill="none" stroke="#5a5246" stroke-width="3"/>
  <rect x="86" y="86" width="1068" height="1582" fill="none" stroke="#5a5246" stroke-width="1"/>
  <g font-family="Noto Sans Devanagari, sans-serif" fill="#2a2620">
    <text x="620" y="180" font-size="42" font-weight="600" text-anchor="middle">दाखिल खारिज आदेश</text>
    <text x="620" y="224" font-size="21" text-anchor="middle">राजस्व विभाग · उत्तर प्रदेश</text>
    <line x1="150" y1="252" x2="1090" y2="252" stroke="#8a8070" stroke-width="1"/>
    ${lines}
    <line x1="150" y1="${footerY - 30}" x2="1090" y2="${footerY - 30}" stroke="#8a8070" stroke-width="1"/>
    <text x="170" y="${footerY}" font-size="19">उपरोक्त अंतरण के आधार पर नामांतरण स्वीकृत किया जाता है।</text>
    <circle cx="930" cy="${footerY + 170}" r="58" fill="none" stroke="#9c5c4a" stroke-width="3"/>
    <text x="930" y="${footerY + 176}" font-size="15" fill="#9c5c4a" text-anchor="middle">तहसील कार्यालय</text>
    <text x="170" y="${footerY + 250}" font-size="20">हस्ताक्षर — तहसीलदार</text>
  </g>
</svg>
`;
}
