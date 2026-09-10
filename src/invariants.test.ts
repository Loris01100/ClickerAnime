/*
 * Les invariants de `CLAUDE.md` qu'une machine peut tenir.
 *
 * Ce fichier ne teste pas une règle du jeu : il relit le dépôt. Trois des invariants énoncés en
 * prose sont des propriétés du code source, vérifiables par une lecture de fichiers — et les trois
 * dérivaient déjà (les couleurs en dur, elles, avaient dérivé cinq fois). Une relecture humaine
 * laisse passer ce genre de chose ; un test non.
 *
 * Il vit à la racine de `src/` à dessein : il porte sur les deux couches, pas sur le moteur seul.
 * Le hook `PostToolUse` le rejoue après toute édition sous `src/engine/`, `src/data/` ou
 * `src/styles/`.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)));

function filesUnder(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, keep));
    else if (keep(full)) out.push(full);
  }
  return out;
}

const posix = (path: string) => relative(SRC, path).split("\\").join("/");
const read = (path: string) => readFileSync(path, "utf8");

// Les commentaires citent volontiers ce qu'ils interdisent — `Math.random`, une couleur d'exemple.
// Les retirer avant de chercher est ce qui garde le test lisible sans le rendre menteur.
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("le moteur reste pur", () => {
  // La couture réactive, et rien d'autre. `sim*` pilote cette couture sans être une règle du jeu,
  // et les tests l'instancient avec `createRoot` — trois exceptions, celles que `CLAUDE.md` nomme.
  const SEAM = /^engine\/(gameState\.ts|store\/[^/]+\.ts|sim\.ts|sim\.cli\.ts|sim\.matrix\.cli\.ts|tests\/[^/]+\.ts)$/;

  const engineFiles = filesUnder(join(SRC, "engine"), (path) => path.endsWith(".ts"));

  it("n'importe Solid que dans la couture réactive", () => {
    const offenders = engineFiles
      .map(posix)
      .filter((path) => !SEAM.test(path))
      .filter((path) => /from\s+["']solid-js/.test(read(join(SRC, path))));

    expect(offenders).toEqual([]);
  });

  it("n'appelle Math.random que dans gameState", () => {
    // `sim.ts` remplace `Math.random` par un générateur graine le temps d'une simulation, et les
    // tests vérifient qu'il le restitue : ils le nomment sans en être une source d'aléa.
    const allowed = new Set(["engine/gameState.ts", "engine/sim.ts"]);

    const offenders = engineFiles
      .map(posix)
      .filter((path) => !allowed.has(path) && !path.startsWith("engine/tests/"))
      .filter((path) => /Math\.random\s*\(/.test(stripComments(read(join(SRC, path)))));

    expect(offenders).toEqual([]);
  });
});

describe("le thème tient", () => {
  // Une couleur ne s'écrit que dans une déclaration de custom property — donc dans le bloc `:root`
  // de foundation.css et ses deux reprises sombres. Partout ailleurs, c'est `var(--token)`.
  const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;

  it("ne code en dur aucune couleur dans une règle", () => {
    const offenders: string[] = [];

    for (const file of filesUnder(join(SRC, "styles"), (path) => path.endsWith(".css"))) {
      const source = stripComments(read(file));

      // Découper sur `;` et sur les accolades recolle les valeurs écrites sur plusieurs lignes
      // (`--speedlines`, `--stage-bg`) en une déclaration, et isole chaque règle de sa voisine.
      for (const raw of source.split(/[;{}]/)) {
        const declaration = raw.trim();
        if (declaration.startsWith("--")) continue; // un token : c'est ici que la couleur se pose

        // `hsl(var(--world-hue) ...)` est la teinte par monde, la seule couleur qu'une règle
        // compose — et elle la compose à partir d'un token, ce que l'invariant demande.
        if (COLOUR.test(declaration.replace(/\b(?:rgba?|hsla?)\([^)]*var\([^)]*\)[^)]*\)/g, ""))) {
          offenders.push(`${posix(file)} — ${declaration.split("\n").pop()?.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
