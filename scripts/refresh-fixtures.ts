import { writeFileSync } from "node:fs";
import { borutoArcs } from "../src/data/boruto/arcs";
import { shippudenArcs } from "../src/data/shippuden/arcs";

writeFileSync("src/data/boruto/arcs.fixture.json", JSON.stringify(borutoArcs, null, 2) + "\n");
writeFileSync("src/data/shippuden/arcs.fixture.json", JSON.stringify(shippudenArcs, null, 2) + "\n");
