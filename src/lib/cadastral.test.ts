import { strict as assert } from "node:assert";
import { test } from "node:test";
import { areaHa, checkAgainstMap, overlapHa, type Point, type VillageMap } from "@/lib/cadastral";
import { VILLAGE_MAPS } from "@/lib/village-maps";

/** The record-against-map checks. Metres in, hectares out. */

const square = (x: number, y: number, side: number): Point[] => [[x, y], [x + side, y], [x + side, y + side], [x, y + side]];

test("a 100 m square is one hectare, whichever way round it is drawn", () => {
  assert.equal(areaHa(square(0, 0, 100)), 1);
  assert.equal(areaHa([...square(0, 0, 100)].reverse()), 1);
});

test("a skewed plot measures by its true area, not its bounding box", () => {
  assert.ok(Math.abs(areaHa([[170, 0], [288, 0], [290, 100], [172, 100]]) - 1.18) < 1e-9);
});

test("overlap is measured exactly; plots that only touch do not overlap", () => {
  assert.ok(Math.abs(overlapHa(square(0, 0, 100), square(50, 50, 100)) - 0.25) < 1e-9);
  assert.equal(overlapHa(square(0, 0, 100), square(100, 0, 100)), 0);
});

const MAP: VillageMap = {
  district: "जिला", village: "ग्राम", surveyed: "2020-01-01",
  plots: [
    { khasra: "1", outline: square(0, 0, 100) },
    { khasra: "2", outline: square(90, 0, 100) },
    { khasra: "3", outline: square(0, 200, 100) },
  ],
};

test("a khasra the map does not hold is reported, not guessed", () => {
  const check = checkAgainstMap(MAP, { khasraNumber: "9", plotArea: "1.000" });
  assert.equal(check.status, "NOT_ON_MAP");
});

test("area within 2% of the record agrees; beyond it differs", () => {
  assert.equal(checkAgainstMap(MAP, { khasraNumber: "3", plotArea: "1.015" }).status, "MATCHES");
  const off = checkAgainstMap(MAP, { khasraNumber: "3", plotArea: "1.100" });
  assert.equal(off.status, "DIFFERS");
  assert.equal(off.findings[0].kind, "areaDiffers");
});

test("an overlapping neighbour is named, with how much land is in dispute", () => {
  const check = checkAgainstMap(MAP, { khasraNumber: "1", plotArea: "1.000" });
  const overlap = check.findings.find((f) => f.kind === "overlap");
  assert.ok(overlap && overlap.kind === "overlap" && overlap.other === "2");
  assert.ok(Math.abs(overlap.overlapHa - 0.1) < 1e-9);
});

test("no map for the village, or no khasra on the record, is not a finding", () => {
  assert.equal(checkAgainstMap(null, { khasraNumber: "1", plotArea: "1" }).status, "NO_MAP");
  assert.equal(checkAgainstMap(MAP, { khasraNumber: null, plotArea: "1" }).status, "NO_MAP");
});

test("the synthetic maps agree with every seeded record except the planted cases", () => {
  const planted = new Set(["142/3", "29", "147"]);
  for (const map of VILLAGE_MAPS) {
    for (const plot of map.plots) {
      const overlaps = map.plots.some((other) => other !== plot && overlapHa(plot.outline, other.outline) > 0.001);
      if (!planted.has(plot.khasra)) assert.equal(overlaps, false, `${map.village} ${plot.khasra} overlaps`);
    }
  }
});
