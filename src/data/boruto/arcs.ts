import { buildWorldArcs, type ArcSpec } from "../buildWorldArcs";
import { withBossTraits } from "../bossTraits";

// Boruto is a generated table world (see `boruto/index.ts` for its steeper ramps): it carries only
// its simulator-fitted numbers and lets `buildWorldArcs` derive every id and constant field. The
// values are unchanged from the previous literal array — `arcs.equivalence.test.ts` pins the built
// output to `arcs.fixture.json` bit for bit. Edit a number here, re-run `npm run sim`, then refresh
// the fixture (see the test). The boss-trait preset sequence uses offset 2 to stay off Naruto's and
// Shippūden's.
const specs: ArcSpec[] = [
  {
    slug: "academie",
    name: "L'Académie de Konoha",
    map: [0.512, 0.414],
    mobsToBoss: 52,
    mobItem: "item-plastron",
    mobs: [
      { name: "Denki Kaminarimon", hp: 11_100_000_000, reward: 22_000_000 },
      { name: "Sumire Kakei", hp: 15_100_000_000, reward: 28_600_000 },
      { name: "Iwabe Yuino", hp: 19_200_000_000, reward: 35_200_000 },
    ],
    rivals: [
      { name: "Boruto Uzumaki", charId: "boruto" },
      { name: "Sarada Uchiwa", charId: "sarada" },
      { name: "Mitsuki", charId: "mitsuki" },
    ],
    rivalHp: 45_600_000_000,
    rivalReward: 120_000_000,
    boss: { name: "Sumire Kakei — le Nue déchaîné", hp: 310_000_000_000, reward: 1_200_000_000, timerMs: 90_000, item: "item-sceau-nue", charId: "sumire" },
  },
  {
    slug: "chunin",
    name: "L'Examen Chûnin",
    map: [0.556, 0.44],
    mobsToBoss: 54,
    mobItem: "item-carte-chunin",
    mobs: [
      { name: "Katasuke Tônô", hp: 24_900_000_000, reward: 40_700_000 },
      { name: "Yodo", hp: 33_500_000_000, reward: 52_900_000 },
      { name: "Shinki", hp: 42_300_000_000, reward: 65_100_000 },
    ],
    rivals: [
      { name: "Shikadai Nara", charId: "shikadai" },
      { name: "Inojin Yamanaka", charId: "inojin" },
      { name: "Chôchô Akimichi", charId: "chocho" },
      { name: "Metal Lee", charId: "metal-lee" },
      { name: "Kinshiki Ôtsutsuki", charId: "kinshiki" },
    ],
    rivalHp: 102_000_000_000,
    rivalReward: 222_000_000,
    boss: { name: "Momoshiki Ôtsutsuki", hp: 743_000_000_000, reward: 2_220_000_000, timerMs: 105_000, item: "item-fruit-chakra", charId: "momoshiki" },
  },
  {
    slug: "mitsuki",
    name: "La Disparition de Mitsuki",
    map: [0.397, 0.222],
    mobsToBoss: 56,
    mobItem: "item-fragment-akuta",
    mobs: [
      { name: "Kirara", hp: 56_100_000_000, reward: 75_300_000 },
      { name: "Sekiei", hp: 75_900_000_000, reward: 97_900_000 },
      { name: "Kokuyô", hp: 95_900_000_000, reward: 120_000_000 },
    ],
    rivals: [
      { name: "Sekiei", charId: "sekiei" },
      { name: "Kokuyô", charId: "kokuyo" },
      { name: "Urashiki Ôtsutsuki", charId: "urashiki" },
    ],
    rivalHp: 228_000_000_000,
    rivalReward: 410_000_000,
    boss: { name: "Kû", hp: 1_780_000_000_000, reward: 4_100_000_000, timerMs: 120_000, item: "item-noyau-akuta", charId: "ku" },
  },
  {
    slug: "brume",
    name: "Le Village de la Brume Sanglante",
    map: [0.863, 0.451],
    mobsToBoss: 58,
    mobItem: "item-eclat-hiramekarei",
    mobs: [
      { name: "Ichirôta Oniyuzu", hp: 126_000_000_000, reward: 139_000_000 },
      { name: "Hachiya Tsurushi", hp: 170_000_000_000, reward: 181_000_000 },
      { name: "Hebiichigo", hp: 214_000_000_000, reward: 223_000_000 },
    ],
    rivals: [
      { name: "Kagura Karatachi", charId: "kagura" },
      { name: "Buntan Kurosuki", charId: "buntan" },
    ],
    rivalHp: 514_000_000_000,
    rivalReward: 759_000_000,
    boss: { name: "Shizuma Hoshigaki", hp: 4_250_000_000_000, reward: 7_590_000_000, timerMs: 150_000, item: "item-sept-lames", charId: "shizuma" },
  },
  {
    slug: "kara",
    name: "L'Éveil de Kara",
    map: [0.3, 0.33],
    mobsToBoss: 60,
    mobItem: "item-outil-scientifique",
    mobs: [
      { name: "Garô", hp: 284_000_000_000, reward: 258_000_000 },
      { name: "Koji Kashin", hp: 384_000_000_000, reward: 335_000_000 },
      { name: "Code", hp: 480_000_000_000, reward: 412_000_000 },
    ],
    rivals: [
      { name: "Ao", charId: "ao" },
      { name: "Konohamaru Sarutobi", charId: "konohamaru" },
      { name: "Victor", charId: "victor" },
    ],
    rivalHp: 1_160_000_000_000,
    rivalReward: 1_400_000_000,
    boss: { name: "Deepa", hp: 10_200_000_000_000, reward: 14_000_000_000, timerMs: 180_000, item: "item-carbone-pur", charId: "deepa" },
  },
  {
    slug: "vase",
    name: "Le Vase et Kawaki",
    map: [0.478, 0.462],
    mobsToBoss: 62,
    mobItem: "item-fragment-vase",
    mobs: [
      { name: "Koji Kashin", hp: 640_000_000_000, reward: 477_000_000 },
      { name: "Amado Sanzu", hp: 869_000_000_000, reward: 620_000_000 },
      { name: "Kawaki", hp: 1_100_000_000_000, reward: 763_000_000 },
    ],
    rivals: [
      { name: "Kawaki", charId: "kawaki" },
      { name: "Koji Kashin", charId: "koji" },
      { name: "Amado Sanzu", charId: "amado" },
    ],
    rivalHp: 2_620_000_000_000,
    rivalReward: 2_600_000_000,
    boss: { name: "Delta", hp: 24_300_000_000_000, reward: 26_000_000_000, timerMs: 195_000, item: "item-bras-delta", charId: "delta" },
  },
  {
    slug: "assaut",
    name: "L'Assaut de Kara",
    map: [0.7, 0.27],
    mobsToBoss: 64,
    mobItem: "item-noyau-scientifique",
    mobs: [
      { name: "Delta", hp: 1_440_000_000_000, reward: 882_000_000 },
      { name: "Koji Kashin", hp: 1_940_000_000_000, reward: 1_150_000_000 },
      { name: "Kawaki", hp: 2_430_000_000_000, reward: 1_410_000_000 },
    ],
    rivals: [
      { name: "Code", charId: "code" },
      { name: "Garô", charId: "garo" },
    ],
    rivalHp: 5_890_000_000_000,
    rivalReward: 4_810_000_000,
    boss: { name: "Boro", hp: 58_100_000_000_000, reward: 48_100_000_000, timerMs: 240_000, item: "item-regeneration-boro", charId: "boro" },
  },
  {
    slug: "isshiki",
    name: "Isshiki Ôtsutsuki",
    map: [0.93, 0.85],
    mobsToBoss: 66,
    mobItem: "item-fragment-karma",
    mobs: [
      { name: "Naruto Uzumaki", hp: 3_240_000_000_000, reward: 1_630_000_000 },
      { name: "Kawaki", hp: 4_390_000_000_000, reward: 2_120_000_000 },
      { name: "Boruto Uzumaki", hp: 5_500_000_000_000, reward: 2_610_000_000 },
    ],
    rivals: [{ name: "Jigen", charId: "jigen" }],
    rivalHp: 13_400_000_000_000,
    rivalReward: 8_890_000_000,
    boss: { name: "Isshiki Ôtsutsuki", hp: 139_000_000_000_000, reward: 88_900_000_000, timerMs: 240_000, item: "item-sceptre-isshiki", charId: "isshiki" },
  },
];

export const borutoArcs = withBossTraits(buildWorldArcs("boruto", specs), 2);
