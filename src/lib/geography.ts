/**
 * Where districts are — for the state-wise view and the schematic map.
 *
 * Keys are district names as the records write them, in Devanagari. A
 * district the table does not know is shown as "not yet assigned" rather than
 * guessed: a record misread as the wrong district must not quietly move
 * between states.
 */

export type StateCode = "UP";

/** District headquarters, [longitude, latitude], approximate. Uttar Pradesh. */
export const DISTRICT_HQ: Record<string, [number, number]> = {
  "लखनऊ": [80.95, 26.85],
  "कानपुर नगर": [80.35, 26.45],
  "प्रयागराज": [81.85, 25.44],
  "वाराणसी": [82.99, 25.32],
  "गोरखपुर": [83.37, 26.76],
  "आगरा": [78.01, 27.18],
  "मेरठ": [77.71, 28.98],
  "बरेली": [79.43, 28.37],
  "झाँसी": [78.57, 25.45],
  "झांसी": [78.57, 25.45],
  "अयोध्या": [82.2, 26.79],
  "मुरादाबाद": [78.78, 28.84],
  "अलीगढ़": [78.08, 27.88],
  "सहारनपुर": [77.55, 29.96],
  "मिर्ज़ापुर": [82.57, 25.15],
  "मिर्जापुर": [82.57, 25.15],
  "आज़मगढ़": [83.18, 26.07],
  "आजमगढ़": [83.18, 26.07],
};

/** Every district above is in Uttar Pradesh — the only state with records yet. */
const DISTRICT_STATE: Record<string, StateCode> = Object.fromEntries(
  Object.keys(DISTRICT_HQ).map((district) => [district, "UP" as const]),
);

export function stateOf(district: string | null | undefined): StateCode | null {
  if (!district) return null;
  return DISTRICT_STATE[district.trim()] ?? null;
}
