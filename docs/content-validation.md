# Content validation

TypeScript can prove that a character has an `arcIds: string[]`; it cannot prove that those ids
name real arcs, belong to the same anime, or describe a coherent sequel. `dataValidation.ts` treats
the complete `GameData` as a graph and reports those semantic mistakes with a code and an exact
path.

`npm run validate:data` checks the production content directly. The same validator runs inside the
Vitest suite, and CI calls the explicit command before tests and build so a bad content edit cannot
reach `main`.

It currently checks:

- unique anime, arc, character, item, enemy, ability and shop-offer ids;
- resolvable anime prerequisites with no cycle, and contiguous arc order per anime;
- valid enemy numbers, drop chances, timers, boss traits and item kinds;
- every recruit and item reference, exactly one recruitment source per regular character, and a
  shop source for shop-exclusive characters;
- every `Character.arcIds` entry exists and belongs to the character's recruitment anime;
- every `appearanceAnimeIds` entry exists and is a later anime in the same sequel chain;
- full sequel synergy has a declared appearance or evolution first;
- evolutions point forward in the same universe;
- equipment and shop restrictions point to existing content;
- every arc retains a non-recruit mob and a common item after its cast has joined.

This is **structural validation**, not a source of canonical anime facts. It can prove that Naruto's
declared Shippūden presence is internally usable; it cannot independently know whether a minor
character truly appeared in episode 287. That editorial decision remains in
`appearanceAnimeIds`/`fullSynergyAnimeIds`, while the validator prevents the declaration from being
misspelled, attached to Bleach, or contradicted by the arc graph.
