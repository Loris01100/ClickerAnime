// Dev-time only: downloads character portraits from Jikan (MyAnimeList) into
// src/assets/sprites/<id>.<ext>, the same naming convention Sprite.tsx already reads via
// import.meta.glob. Never imported by the app, never run at build or runtime — see design.md §6.2.
//
// Usage: node scripts/fetch-art.mjs
//
// Always review what lands before committing: a name match can pick the wrong character on
// homonyms, and Jikan's canonical name can differ from a data file's localized one (its Naruto
// entry is "Sasuke Uchiha", not the French data's "Sasuke Uchiwa").
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = path.join(__dirname, "..", "src", "assets", "sprites");
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

// id -> Jikan search query. Extend by hand as more characters get real art.
const MANIFEST = [
  { id: "sakura-haruno", query: "Sakura Haruno" },
  { id: "kakashi-hatake", query: "Kakashi Hatake" },
  { id: "haku", query: "Haku Naruto" },
];

async function searchCharacter(query) {
  const url = `https://api.jikan.moe/v4/characters?q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jikan search failed for "${query}": ${res.status}`);
  const body = await res.json();
  return body.data?.[0] ?? null;
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed for ${url}: ${res.status}`);
  await writeFile(destPath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  await mkdir(SPRITES_DIR, { recursive: true });
  for (const { id, query } of MANIFEST) {
    const existing = IMAGE_EXTENSIONS.find((ext) => existsSync(path.join(SPRITES_DIR, `${id}.${ext}`)));
    if (existing) {
      console.log(`skip ${id}: already has ${id}.${existing}`);
      continue;
    }

    const match = await searchCharacter(query);
    const imageUrl = match?.images?.jpg?.image_url;
    if (!imageUrl) {
      console.log(`no image found for "${query}" (${id})`);
      continue;
    }

    const dest = path.join(SPRITES_DIR, `${id}.jpg`);
    await downloadImage(imageUrl, dest);
    console.log(`saved ${id}.jpg <- Jikan match "${match.name}" (${imageUrl})`);

    // Jikan's public rate limit is ~3 req/s / 60 req/min — stay well under it between characters.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

main();
