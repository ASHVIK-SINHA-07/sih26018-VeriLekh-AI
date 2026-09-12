import type { Point, VillageMap } from "@/lib/cadastral";

/**
 * Village cadastral maps — SYNTHETIC, like everything in the demo data.
 *
 * Plot boundaries are invented, in metres on a local grid, for the villages
 * the seeded records name. Areas are drawn to agree with those records, except
 * where a problem is planted for the checks to find:
 *
 *   रामपुर खुर्द 142/3  drawn at 1.180 ha against a record of 1.245 ha — the
 *                       same 5.2% shortfall the simulated survey holds.
 *   टिकरी 29 and 147     boundaries overlap by 0.1 ha — a boundary dispute.
 *   मुबारकपुर 64          left off the map — the record or the map is wrong.
 *
 * A real deployment reads village maps from Bhu-Naksha, joined by village code
 * and khasra number. Nothing here is a real parcel.
 */

const rect = (x: number, y: number, w: number, h: number): Point[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

export const VILLAGE_MAPS: VillageMap[] = [
  {
    district: "वाराणसी", village: "रामपुर खुर्द", surveyed: "2019-03-15",
    plots: [
      { khasra: "142/1", outline: rect(0, 0, 90, 100) },
      { khasra: "142/2", outline: rect(90, 0, 80, 100) },
      // PLANTED — 118 m × 100 m = 1.180 ha; the record says 1.245 ha.
      { khasra: "142/3", outline: [[170, 0], [288, 0], [290, 100], [172, 100]] },
      { khasra: "143", outline: [[288, 0], [380, 0], [380, 100], [290, 100]] },
      { khasra: "301/1", outline: rect(0, 100, 120, 100) },
      { khasra: "301/2", outline: rect(120, 100, 87, 100) },
      { khasra: "302", outline: rect(207, 100, 173, 100) },
    ],
  },
  {
    district: "लखनऊ", village: "भगवंतपुर", surveyed: "2018-11-02",
    plots: [
      { khasra: "57", outline: rect(0, 0, 100, 90) },
      { khasra: "58/1", outline: rect(100, 0, 85, 80) },
      { khasra: "58/2", outline: rect(185, 0, 83, 50) },
      { khasra: "59", outline: rect(185, 50, 83, 30) },
      { khasra: "60", outline: rect(0, 90, 140, 70) },
      { khasra: "61", outline: rect(140, 90, 128, 70) },
    ],
  },
  {
    district: "लखनऊ", village: "नौगवां", surveyed: "2018-11-02",
    plots: [
      { khasra: "104/5", outline: rect(0, 0, 80, 100) },
      { khasra: "104/6", outline: rect(80, 0, 92.5, 100) },
      { khasra: "105", outline: rect(172.5, 0, 110, 100) },
    ],
  },
  {
    district: "गोरखपुर", village: "सलेमपुर", surveyed: "2020-06-20",
    plots: [
      { khasra: "77/1", outline: rect(0, 0, 120, 150) },
      { khasra: "77/2", outline: rect(120, 0, 141, 150) },
      { khasra: "63/1", outline: rect(0, 150, 110, 60) },
      { khasra: "63/2", outline: rect(110, 150, 110, 50) },
      { khasra: "64", outline: rect(220, 150, 41, 80) },
    ],
  },
  {
    district: "गोरखपुर", village: "चांदपुर", surveyed: "2020-06-20",
    plots: [
      { khasra: "8", outline: rect(0, 0, 23, 50) },
      { khasra: "9", outline: rect(23, 0, 77, 50) },
      { khasra: "91/3", outline: rect(0, 50, 60, 100) },
      { khasra: "91/4", outline: rect(60, 50, 101, 100) },
    ],
  },
  {
    district: "कानपुर नगर", village: "टिकरी", surveyed: "2017-09-08",
    plots: [
      { khasra: "28", outline: rect(0, 0, 90, 110) },
      // PLANTED — 29 and 147 share 20 m × 50 m of ground: 0.1 ha in dispute.
      { khasra: "29", outline: rect(90, 0, 170, 110) },
      { khasra: "147", outline: rect(240, 60, 120, 110) },
      { khasra: "30", outline: rect(0, 110, 240, 60) },
    ],
  },
  {
    district: "प्रयागराज", village: "मुबारकपुर", surveyed: "2021-01-12",
    // PLANTED — no khasra 64, though a record names it.
    plots: [
      { khasra: "310/1", outline: rect(0, 0, 90, 45) },
      { khasra: "310/2", outline: rect(90, 0, 110, 45) },
      { khasra: "188/5", outline: rect(0, 45, 95, 80) },
      { khasra: "188/6", outline: rect(95, 45, 105, 80) },
    ],
  },
  {
    district: "वाराणसी", village: "देवरीखास", surveyed: "2019-03-15",
    plots: [
      { khasra: "212", outline: rect(0, 0, 200, 170) },
      { khasra: "256/1", outline: rect(200, 0, 60, 120) },
      { khasra: "256/2", outline: rect(200, 120, 58, 50) },
    ],
  },
];
