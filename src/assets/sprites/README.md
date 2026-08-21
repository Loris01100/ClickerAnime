# Custom sprites

Drop an image here named after an id — `<id>.png` (`.jpg`, `.jpeg`, `.webp`, `.gif` and `.svg`
also work) — and `Sprite.tsx` picks it up automatically in place of the generated pixel
placeholder for that id, everywhere it's used. No code change needed.

The id is whatever gets passed as `seed` to `<Sprite>`:

- A character → the character's `id` in `src/data/*.ts` (e.g. `naruto-uzumaki.png`).
- A mob or boss fought directly → the enemy's own `id` (e.g. `vagues-zabuza.png` for the
  "Zabuza Momochi" boss).
- A mob that recruits a character on death → the *character's* id, not the mob's — the fight
  screen shows the character's sprite for it.

The image is scaled to fit the same box the generated sprite would have used at that spot
(`object-fit: contain`, so nothing is cropped or stretched), which keeps every layout stable
whether an id has real art yet or not. Any aspect ratio is fine.

This folder is empty until art actually lands — that's expected, not a bug.
