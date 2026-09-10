/*
 * Le strict nécessaire des modules Node utilisés côté outillage, déclaré à la main.
 *
 * Le dépôt n'installe pas `@types/node` : c'est un navigateur qu'il cible, et `tsconfig` ne charge
 * que `vite/client`. `sim.cli.ts` déclare déjà `process` sur place pour la même raison — mais un
 * `declare module` ne peut pas vivre dans un fichier qui a ses propres imports (TypeScript y lit
 * une *augmentation* de module, qui exige que le module existe déjà). D'où ce fichier ambiant.
 *
 * On n'y déclare que ce qu'on appelle vraiment. Élargir une signature au passage n'apporte rien :
 * ce qui manque se voit à la première utilisation.
 */
declare module "node:fs" {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function statSync(path: string): { isDirectory(): boolean };
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...parts: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}
