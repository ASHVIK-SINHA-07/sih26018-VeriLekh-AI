/**
 * Synthetic ownership chains — SYNTHETIC, like everything in the seed.
 *
 * Five parcels, each carrying the mutation history a register would hold
 * across roughly two decades. One is clean. Each of the others carries one of
 * the defects that a chain of title exists to catch, because a chain panel
 * that only ever shows clean histories demonstrates nothing:
 *
 *   142/3  clean — and carries a correction, to show a fix is recorded as
 *          history rather than overwriting what was believed before
 *   58/1   a sale registered in 2025 that the Record of Rights never caught
 *          up with (agrees with the simulated Registration source)
 *   77/2   the same land sold twice to different buyers
 *   29     a sale dated 2014 by a holder whose interest passed on his death
 *          in 2011 — and entered after a 2020 transfer, so it is backdated
 *   310/1  an inheritance that hands the heirs 7/6 of the parcel
 *
 * Every name is invented. Nothing here is a real person or a real parcel.
 */

import type { MutationType } from "@prisma/client";

export interface SeedMutation {
  /** Local key so a correction can point at the entry it replaces. */
  key: string;
  type: MutationType;
  from?: string;
  to: string;
  share: string;
  effective: string;           // YYYY-MM-DD, when it happened
  recorded: string;            // YYYY-MM-DD, when it was digitised
  number?: string;
  order?: string;
  supersedes?: string;         // key of the entry this corrects
}

export interface SeedChain {
  khasraNumber: string;
  village: string;
  district: string;
  tehsil: string;
  note: string;
  mutations: SeedMutation[];
}

export const SEED_CHAINS: SeedChain[] = [
  {
    khasraNumber: "142/3", village: "रामपुर खुर्द", district: "वाराणसी", tehsil: "पिंडरा",
    note: "clean — with one correction recorded as history",
    mutations: [
      { key: "a1", type: "ORIGINAL", to: "रामेश्वर प्रसाद वर्मा", share: "1",
        effective: "2005-03-10", recorded: "2026-08-20", number: "118/2005" },
      { key: "a2", type: "INHERITANCE", from: "रामेश्वर प्रसाद वर्मा", to: "राजेश कुमार वर्मा", share: "1/2",
        effective: "2012-07-02", recorded: "2026-08-20", number: "406/2012" },
      // Mis-transcribed at digitisation: the register says 1/2, not 1/3.
      { key: "a3", type: "INHERITANCE", from: "रामेश्वर प्रसाद वर्मा", to: "सुरेश कुमार वर्मा", share: "1/3",
        effective: "2012-07-02", recorded: "2026-08-20", number: "407/2012" },
      { key: "a4", type: "SALE", from: "सुरेश कुमार वर्मा", to: "राजेश कुमार वर्मा", share: "1/2",
        effective: "2019-11-20", recorded: "2026-08-20", number: "1189/2019",
        order: "Sale deed 3342/2019, SRO Pindra" },
      // The correction. Entered weeks later; restates a3; never overwrites it.
      { key: "a5", type: "INHERITANCE", from: "रामेश्वर प्रसाद वर्मा", to: "सुरेश कुमार वर्मा", share: "1/2",
        effective: "2012-07-02", recorded: "2026-09-02", number: "407/2012", supersedes: "a3" },
    ],
  },
  {
    khasraNumber: "58/1", village: "भगवंतपुर", district: "लखनऊ", tehsil: "मलिहाबाद",
    note: "PLANTED — sale registered 2025, Record of Rights never updated",
    mutations: [
      { key: "b1", type: "ORIGINAL", to: "रामनाथ मिश्रा", share: "1",
        effective: "2006-04-12", recorded: "2026-08-21", number: "77/2006" },
      { key: "b2", type: "INHERITANCE", from: "रामनाथ मिश्रा", to: "सुनीता देवी मिश्रा", share: "1",
        effective: "2014-01-20", recorded: "2026-08-21", number: "52/2014" },
      { key: "b3", type: "SALE", from: "सुनीता देवी मिश्रा", to: "अनिल कुमार मिश्रा", share: "1",
        effective: "2025-11-28", recorded: "2026-08-21",
        order: "Sale deed 8817/2025, SRO Malihabad" },
    ],
  },
  {
    khasraNumber: "77/2", village: "सलेमपुर", district: "गोरखपुर", tehsil: "सहजनवा",
    note: "PLANTED — the same land sold twice",
    mutations: [
      { key: "c1", type: "ORIGINAL", to: "हरिशंकर यादव", share: "1",
        effective: "2008-01-15", recorded: "2026-08-22", number: "31/2008" },
      { key: "c2", type: "SALE", from: "हरिशंकर यादव", to: "कमला प्रसाद यादव", share: "1",
        effective: "2016-04-04", recorded: "2026-08-22", number: "612/2016",
        order: "Sale deed 2204/2016, SRO Sahjanwa" },
      { key: "c3", type: "SALE", from: "हरिशंकर यादव", to: "मोहन लाल गुप्ता", share: "1",
        effective: "2018-09-12", recorded: "2026-08-22", number: "977/2018",
        order: "Sale deed 5561/2018, SRO Gorakhpur Sadar" },
    ],
  },
  {
    khasraNumber: "29", village: "टिकरी", district: "कानपुर नगर", tehsil: "बिल्हौर",
    note: "PLANTED — backdated sale by a holder who had died",
    mutations: [
      { key: "d1", type: "ORIGINAL", to: "गंगा राम तिवारी", share: "1",
        effective: "2005-06-01", recorded: "2026-08-23", number: "140/2005" },
      { key: "d2", type: "INHERITANCE", from: "गंगा राम तिवारी", to: "राम नरेश तिवारी", share: "1/2",
        effective: "2011-02-18", recorded: "2026-08-23", number: "88/2011" },
      { key: "d3", type: "INHERITANCE", from: "गंगा राम तिवारी", to: "श्याम नारायण तिवारी", share: "1/2",
        effective: "2011-02-18", recorded: "2026-08-23", number: "89/2011" },
      { key: "d4", type: "SALE", from: "श्याम नारायण तिवारी", to: "राम नरेश तिवारी", share: "1/2",
        effective: "2020-03-09", recorded: "2026-08-23", number: "301/2020",
        order: "Sale deed 1790/2020, SRO Bilhaur" },
      // Entered after the 2020 sale, dated 2014, by a man who died in 2011.
      { key: "d5", type: "SALE", from: "गंगा राम तिवारी", to: "रमेश चंद्र शुक्ल", share: "1/4",
        effective: "2014-08-30", recorded: "2026-08-23", number: "412/2014" },
    ],
  },
  {
    khasraNumber: "310/1", village: "मुबारकपुर", district: "प्रयागराज", tehsil: "सोरांव",
    note: "PLANTED — inheritance allots 7/6 of the parcel",
    mutations: [
      { key: "e1", type: "ORIGINAL", to: "अब्दुल करीम", share: "1",
        effective: "2007-05-05", recorded: "2026-08-24", number: "63/2007" },
      { key: "e2", type: "INHERITANCE", from: "अब्दुल करीम", to: "फातिमा बेगम", share: "1/2",
        effective: "2013-10-10", recorded: "2026-08-24", number: "219/2013" },
      { key: "e3", type: "INHERITANCE", from: "अब्दुल करीम", to: "सलमा बेगम", share: "1/3",
        effective: "2013-10-10", recorded: "2026-08-24", number: "220/2013" },
      { key: "e4", type: "INHERITANCE", from: "अब्दुल करीम", to: "रशीद अहमद", share: "1/3",
        effective: "2013-10-10", recorded: "2026-08-24", number: "221/2013" },
    ],
  },
];
