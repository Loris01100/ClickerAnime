import type { GameData } from "../../engine/gameState";

export const horimiyaCharacters: GameData["characters"] = [
  {
    id: "horimiya-hori", name: "Kyoko Hori", animeId: "horimiya", rarity: "main",
    tags: ["student", "hori-family", "organizer"],
    arcIds: ["horimiya-secrets-partages", "horimiya-nouveaux-liens", "horimiya-sentiments", "horimiya-quotidien", "horimiya-pieces-manquantes", "horimiya-diplome"],
    baseClickPower: 1, baseDps: 5,
    passive: { target: "teamDps", kind: "percent", value: 0.2 },
    ability: { id: "horimiya-ability-franchise", name: "Parler franchement", cooldownMs: 40_000, durationMs: 7_000, effects: [{ target: "teamDps", kind: "multiplier", value: 2 }] },
  },
  {
    id: "horimiya-miyamura", name: "Izumi Miyamura", animeId: "horimiya", rarity: "main",
    tags: ["student", "miyamura-family", "baker"],
    arcIds: ["horimiya-secrets-partages", "horimiya-nouveaux-liens", "horimiya-sentiments", "horimiya-quotidien", "horimiya-pieces-manquantes", "horimiya-diplome"],
    baseClickPower: 1, baseDps: 6,
    passive: { target: "clickPower", kind: "percent", value: 0.2 },
    ability: { id: "horimiya-ability-vrai-visage", name: "Montrer son vrai visage", cooldownMs: 35_000, durationMs: 6_000, effects: [{ target: "clickPower", kind: "multiplier", value: 2 }] },
  },
  {
    id: "horimiya-sota", name: "Sota Hori", animeId: "horimiya", rarity: "secondary",
    tags: ["child", "hori-family"], arcIds: ["horimiya-secrets-partages", "horimiya-pieces-manquantes", "horimiya-diplome"],
    baseClickPower: 1, baseDps: 4, passive: { target: "teamDps", kind: "percent", value: 0.1 },
  },
  {
    id: "horimiya-toru", name: "Toru Ishikawa", animeId: "horimiya", rarity: "main",
    tags: ["student", "friend"], arcIds: ["horimiya-nouveaux-liens", "horimiya-sentiments", "horimiya-quotidien", "horimiya-diplome"],
    baseClickPower: 2, baseDps: 10, passive: { target: "teamDps", kind: "percent", value: 0.25 },
  },
  {
    id: "horimiya-yuki", name: "Yuki Yoshikawa", animeId: "horimiya", rarity: "main",
    tags: ["student", "friend"], arcIds: ["horimiya-nouveaux-liens", "horimiya-sentiments", "horimiya-quotidien", "horimiya-diplome"],
    baseClickPower: 2, baseDps: 8, passive: { target: "clickPower", kind: "percent", value: 0.25 },
    ability: { id: "horimiya-ability-sourire", name: "Sourire malgré tout", cooldownMs: 50_000, durationMs: 8_000, effects: [{ target: "teamDps", kind: "multiplier", value: 2.25 }] },
  },
  {
    id: "horimiya-sengoku", name: "Kakeru Sengoku", animeId: "horimiya", rarity: "secondary",
    tags: ["student", "student-council"], arcIds: ["horimiya-nouveaux-liens", "horimiya-sentiments", "horimiya-quotidien", "horimiya-diplome"],
    baseClickPower: 2, baseDps: 12, passive: { target: "teamDps", kind: "percent", value: 0.15 },
  },
  {
    id: "horimiya-remi", name: "Remi Ayasaki", animeId: "horimiya", rarity: "main",
    tags: ["student", "student-council"], arcIds: ["horimiya-sentiments", "horimiya-quotidien", "horimiya-diplome"],
    baseClickPower: 3, baseDps: 15, passive: { target: "teamDps", kind: "percent", value: 0.28 },
    ability: { id: "horimiya-ability-coup-de-crayon", name: "Coup de crayon", cooldownMs: 55_000, durationMs: 8_000, effects: [{ target: "clickPower", kind: "multiplier", value: 2.5 }] },
  },
  {
    id: "horimiya-sakura", name: "Sakura Kono", animeId: "horimiya", rarity: "secondary",
    tags: ["student", "student-council", "cook"], arcIds: ["horimiya-sentiments", "horimiya-quotidien", "horimiya-diplome"],
    baseClickPower: 4, baseDps: 19, passive: { target: "clickPower", kind: "percent", value: 0.15 },
    ability: { id: "horimiya-ability-determination", name: "Détermination silencieuse", cooldownMs: 55_000, durationMs: 8_000, effects: [{ target: "clickPower", kind: "percent", value: 0.4 }] },
  },
  {
    id: "horimiya-yanagi", name: "Akane Yanagi", animeId: "horimiya", rarity: "secondary",
    tags: ["student", "friend"], arcIds: ["horimiya-sentiments", "horimiya-quotidien", "horimiya-diplome"],
    baseClickPower: 4, baseDps: 24, passive: { target: "teamDps", kind: "percent", value: 0.18 },
  },
  {
    id: "horimiya-shu", name: "Shu Iura", animeId: "horimiya", rarity: "secondary",
    tags: ["student", "friend", "iura-family"], arcIds: ["horimiya-quotidien", "horimiya-pieces-manquantes", "horimiya-diplome"],
    baseClickPower: 7, baseDps: 38, passive: { target: "teamDps", kind: "percent", value: 0.18 },
    ability: { id: "horimiya-ability-entrain", name: "Entrain communicatif", cooldownMs: 60_000, durationMs: 9_000, effects: [{ target: "teamDps", kind: "percent", value: 0.45 }] },
  },
  {
    id: "horimiya-honoka", name: "Honoka Sawada", animeId: "horimiya", rarity: "secondary",
    tags: ["student", "friend"], arcIds: ["horimiya-quotidien", "horimiya-pieces-manquantes", "horimiya-diplome"],
    baseClickPower: 6, baseDps: 30, passive: { target: "teamDps", kind: "percent", value: 0.18 },
  },
  {
    id: "horimiya-shindo", name: "Koichi Shindo", animeId: "horimiya", rarity: "secondary",
    tags: ["student", "old-friend"], arcIds: ["horimiya-quotidien", "horimiya-pieces-manquantes", "horimiya-diplome"],
    baseClickPower: 8, baseDps: 48, ability: { id: "horimiya-ability-vieil-ami", name: "Un ami de toujours", cooldownMs: 65_000, durationMs: 9_000, effects: [{ target: "teamDps", kind: "percent", value: 0.45 }] },
    passive: { target: "teamDps", kind: "percent", value: 0.18 },
  },
  {
    id: "horimiya-kyosuke", name: "Kyosuke Hori", animeId: "horimiya", rarity: "secondary",
    tags: ["adult", "hori-family"], arcIds: ["horimiya-pieces-manquantes", "horimiya-diplome"],
    baseClickPower: 13, baseDps: 70, passive: { target: "clickPower", kind: "percent", value: 0.2 },
    ability: { id: "horimiya-ability-incruste", name: "Retour imprévisible", cooldownMs: 80_000, durationMs: 11_000, effects: [{ target: "clickPower", kind: "percent", value: 0.5 }] },
  },
  {
    id: "horimiya-yuriko", name: "Yuriko Hori", animeId: "horimiya", rarity: "secondary",
    tags: ["adult", "hori-family"], arcIds: ["horimiya-pieces-manquantes", "horimiya-diplome"],
    baseClickPower: 10, baseDps: 50, passive: { target: "teamDps", kind: "percent", value: 0.2 },
  },
  {
    id: "horimiya-motoko", name: "Motoko Iura", animeId: "horimiya", rarity: "secondary",
    tags: ["student", "iura-family"], arcIds: ["horimiya-pieces-manquantes", "horimiya-diplome"],
    baseClickPower: 15, baseDps: 82, passive: { target: "teamDps", kind: "percent", value: 0.2 },
  },
  {
    id: "horimiya-tanihara", name: "Makio Tanihara", animeId: "horimiya", rarity: "secondary",
    tags: ["student", "old-friend"], arcIds: ["horimiya-diplome"],
    baseClickPower: 18, baseDps: 90, passive: { target: "clickPower", kind: "percent", value: 0.2 },
  },
  {
    id: "horimiya-iori", name: "Iori Miyamura", animeId: "horimiya", rarity: "secondary",
    tags: ["adult", "miyamura-family", "baker"], arcIds: ["horimiya-diplome"],
    baseClickPower: 22, baseDps: 120, passive: { target: "teamDps", kind: "percent", value: 0.2 },
    ability: { id: "horimiya-ability-accueil", name: "Un avenir accueillant", cooldownMs: 90_000, durationMs: 12_000, effects: [{ target: "teamDps", kind: "percent", value: 0.5 }] },
  },
];
