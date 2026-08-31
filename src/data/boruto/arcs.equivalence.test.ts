import { describe, expect, it } from "vitest";
import { borutoArcs } from "./arcs";
import fixture from "./arcs.fixture.json";

// Pins the builder output to the exact literal array Boruto used to ship. The fixture was captured
// from that array before the migration; the builder must reproduce it byte for byte — every id, the
// boss-trait presets, the timer adjustments, all of it. If you intentionally change a number in
// `arcs.ts`, re-run `npm run sim`, then refresh this fixture:
//   npx vite-node -c vite.sim.config.ts -e \
//     'import{writeFileSync}from"node:fs";import{borutoArcs}from"./src/data/boruto/arcs";writeFileSync("src/data/boruto/arcs.fixture.json",JSON.stringify(borutoArcs,null,2)+"\n")'
describe("boruto arcs builder", () => {
  it("reproduces the pre-migration literal array exactly", () => {
    expect(JSON.parse(JSON.stringify(borutoArcs))).toEqual(fixture);
  });
});
