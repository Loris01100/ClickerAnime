import { describe, expect, it } from "vitest";
import { shippudenArcs } from "./arcs";
import fixture from "./arcs.fixture.json";

// Pins the builder output to the exact literal array Shippūden used to ship. The fixture was
// captured from that array before the migration; the builder must reproduce it byte for byte —
// every id, the boss-trait presets, the timer adjustments, all of it. If you intentionally change a
// number in `arcs.ts`, re-run `npm run sim`, then refresh this fixture:
//   npx vite-node -c vite.sim.config.ts -e \
//     'import{writeFileSync}from"node:fs";import{shippudenArcs}from"./src/data/shippuden/arcs";writeFileSync("src/data/shippuden/arcs.fixture.json",JSON.stringify(shippudenArcs,null,2)+"\n")'
describe("shippuden arcs builder", () => {
  it("reproduces the pre-migration literal array exactly", () => {
    // Round-trip through JSON so the comparison ignores nothing but key order (undefined fields,
    // prototypes) — the fixture is JSON, so this is the honest apples-to-apples check.
    expect(JSON.parse(JSON.stringify(shippudenArcs))).toEqual(fixture);
  });
});
