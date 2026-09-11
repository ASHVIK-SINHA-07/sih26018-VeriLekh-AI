/**
 * Simulated authoritative sources — SYNTHETIC, like everything else here.
 *
 * Three systems hold every parcel in the real world and they do not always
 * agree. A government quality evaluation of land records found area-mismatch
 * claims in roughly 11% of cases, ownership on the ground differing from the
 * record in 8%, and a large share of Records of Rights never updated after an
 * inheritance. Those three defects are planted below so reconciliation has
 * something real to catch on camera.
 *
 * Nothing here contacts a government system. This models the *shape* a real
 * LRMS / NGDRS / BhuNaksha integration would return.
 */

export type SeedSource = "ROR" | "REGISTRATION" | "CADASTRAL";

export interface SeedAuthoritative {
  source: SeedSource;
  khasraNumber: string;
  village: string;
  district: string;
  ownerName?: string | null;
  khataNumber?: string | null;
  plotArea?: string | null;
  landClassification?: string | null;
  /** Years before today that this source last touched the parcel. */
  asOfYearsAgo: number;
  note?: string;
}

export const SEED_AUTHORITATIVE: SeedAuthoritative[] = [
  /* ---- varanasi-0412 · khasra 142/3 --------------------------------------
   * PLANTED: the cadastral survey measures this parcel smaller than the
   * revenue record states. The classic area mismatch.
   */
  {
    source: "ROR", khasraNumber: "142/3", village: "रामपुर खुर्द", district: "वाराणसी",
    ownerName: "राजेश कुमार वर्मा", khataNumber: "87", plotArea: "1.245",
    landClassification: "सिंचित", asOfYearsAgo: 0.4,
  },
  {
    source: "CADASTRAL", khasraNumber: "142/3", village: "रामपुर खुर्द", district: "वाराणसी",
    ownerName: null, khataNumber: null, plotArea: "1.180", landClassification: null,
    asOfYearsAgo: 1.2,
    note: "PLANTED — survey extent 5.2% below the revenue record",
  },

  /* ---- lucknow-0219 · khasra 58/1 ----------------------------------------
   * PLANTED: the sub-registrar recorded a sale that the Record of Rights was
   * never updated for, and the RoR has not been touched in eleven years.
   * This is the un-updated mutation, the commonest real defect.
   */
  {
    source: "ROR", khasraNumber: "58/1", village: "भगवंतपुर", district: "लखनऊ",
    ownerName: "सुनीता देवी मिश्रा", khataNumber: "214", plotArea: "0.680",
    landClassification: "असिंचित", asOfYearsAgo: 11,
    note: "PLANTED — stale: not updated since the transfer below",
  },
  {
    source: "REGISTRATION", khasraNumber: "58/1", village: "भगवंतपुर", district: "लखनऊ",
    ownerName: "अनिल कुमार मिश्रा", khataNumber: "214", plotArea: "0.680",
    landClassification: null, asOfYearsAgo: 0.8,
    note: "PLANTED — sale registered; ownership on the ground has changed",
  },

  /* ---- gorakhpur-0102 · khasra 77/2 --------------------------------------
   * Clean: all three agree. A reconciliation panel that only ever shows
   * problems teaches reviewers nothing about what agreement looks like.
   */
  {
    source: "ROR", khasraNumber: "77/2", village: "सलेमपुर", district: "गोरखपुर",
    ownerName: "कमला प्रसाद यादव", khataNumber: "45", plotArea: "2.100",
    landClassification: "सिंचित", asOfYearsAgo: 0.2,
  },
  {
    source: "REGISTRATION", khasraNumber: "77/2", village: "सलेमपुर", district: "गोरखपुर",
    ownerName: "कमला प्रसाद यादव", khataNumber: "45", plotArea: "2.100",
    landClassification: null, asOfYearsAgo: 0.6,
  },
  {
    source: "CADASTRAL", khasraNumber: "77/2", village: "सलेमपुर", district: "गोरखपुर",
    ownerName: null, khataNumber: null, plotArea: "2.115", landClassification: null,
    asOfYearsAgo: 1.0,
    note: "measurement drift of 0.7% — within tolerance, correctly not flagged",
  },
];
