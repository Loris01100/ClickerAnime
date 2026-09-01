import { describe, expect, it } from "vitest";
import { spriteHue, themeOf } from "./hue";
import { describeAbility, describeCharacterTag, describeModifier } from "./describe";
import { imagePathsForAnime, PRESTIGE_IMAGE_PATHS, STARTUP_IMAGE_PATHS } from "./preload";
import { deriveDisclosure, type DisclosureFacts } from "./disclosure";
import { tutorialObjective, type ObjectiveFacts } from "./objective";
import { bossAdvice, bossTraitCounter } from "./advice";
import { newlyUnlocked } from "./unlocks";
import { termsOf } from "./presentation";
import { gameData } from "../data";
import { itemImagePath } from "./ItemIcon";

const emptyDisclosureFacts: DisclosureFacts = {
  kills: 0,
  recruits: 0,
  ownedCharacters: 0,
  unlockedAbilities: 0,
  abilitiesActivated: 0,
  foundItems: 0,
  commonItemsCollected: 0,
  bossesKilled: 0,
  uniquesEquipped: 0,
  arcsCleared: 0,
  pendingPrestige: 0,
  prestigePoints: 0,
  prestiges: 0,
  treeLevels: 0,
  maxWorldPoints: 0,
  packsOpened: 0,
  crossoverCrystals: 0,
  crossoversActivated: 0,
  mixedTeam: false,
  canTravel: false,
  activeChallenge: false,
  completedChallenges: 0,
};

describe("spriteHue", () => {
  it("gives the same hue for the same id, every time", () => {
    expect(spriteHue("char-a1")).toBe(spriteHue("char-a1"));
  });

  it("gives different hues to different ids", () => {
    expect(spriteHue("char-a1")).not.toBe(spriteHue("char-a2"));
  });
});

describe("world presentation vocabulary", () => {
  it("keeps combat defaults and accepts a data-driven social vocabulary", () => {
    expect(termsOf().boss).toBe("Boss");
    expect(
      termsOf({
        id: "social",
        name: "Social",
        unlockCost: 0,
        presentation: { bossLabel: "Épreuve", healthLabel: "Tension" },
      })
    ).toMatchObject({ boss: "Épreuve", health: "Tension", teamDps: "DPS équipe" });
  });
});

describe("themeOf", () => {
  it("falls back to the hash when a world has no hand-picked hue", () => {
    const anime = { id: "w1", name: "W1", unlockCost: 1 };
    expect(themeOf(anime)).toBe(spriteHue("w1"));
  });

  it("prefers a hand-picked hue over the hash", () => {
    const anime = { id: "w1", name: "W1", unlockCost: 1, themeHue: 28 };
    expect(themeOf(anime)).toBe(28);
  });
});

describe("describeModifier", () => {
  it("words each kind of modifier for its target", () => {
    expect(describeModifier({ target: "clickPower", kind: "flat", value: 5 })).toBe("+5 au clic");
    expect(describeModifier({ target: "clickPower", kind: "percent", value: 0.1 })).toBe("+10 % au clic");
    expect(describeModifier({ target: "teamDps", kind: "multiplier", value: 2 })).toBe("x2 de DPS");
    // Un multiplicateur mis à l'échelle (forge, capacité) n'est pas rond : il s'arrondit à
    // l'affichage plutôt que d'écrire « x1.1666666666666667 » dans le panneau Équipe.
    expect(describeModifier({ target: "teamDps", kind: "multiplier", value: 1 + 0.25 * (2 / 3) })).toBe(
      "x1.17 de DPS"
    );
  });

  it("lists every effect of an ability with its timings", () => {
    const text = describeAbility({
      id: "a",
      name: "A",
      cooldownMs: 30_000,
      durationMs: 5_000,
      effects: [{ target: "clickPower", kind: "multiplier", value: 3 }],
    });
    expect(text).toContain("x3 au clic");
    expect(text).toContain("5.0s");
    // La recharge affichée est celle réellement appliquée : 30s x ABILITY_COOLDOWN_SCALE.
    expect(text).toContain("45s");
  });
});

describe("describeCharacterTag", () => {
  it("translates equipment categories and keeps unknown ones readable", () => {
    expect(describeCharacterTag("swordsman")).toBe("Épéiste");
    expect(describeCharacterTag("future-tag")).toBe("future-tag");
  });

  /**
   * Le repli sur l'id brut est un filet de sécurité, pas une traduction : sans ce test, un tag
   * ajouté au contenu s'affiche tel quel dans le Codex (« Type : student-council ») et dans les
   * restrictions d'équipement, en anglais et en kebab-case au milieu d'une interface française.
   * 33 des 93 tags du jeu étaient dans ce cas. C'est du contenu, donc c'est ici que ça se garde.
   */
  it("a un libellé français pour chaque tag écrit dans le contenu", () => {
    const authored = [...new Set(gameData.characters.flatMap((character) => character.tags ?? []))];
    const untranslated = authored.filter((tag) => describeCharacterTag(tag) === tag);
    expect(untranslated, `tags sans libellé français : ${untranslated.join(", ")}`).toEqual([]);
  });
});

describe("imagePathsForAnime", () => {
  it("warms only the selected world's map and item art", () => {
    const data = {
      animes: [
        { id: "a", name: "A", unlockCost: 1, mapImage: "/a.jpg" },
        { id: "b", name: "B", unlockCost: 1, mapImage: "/b.jpg" },
      ],
      arcs: [
        { id: "arc-a", animeId: "a", name: "A", order: 0, mobsToBoss: 1, mobs: [{ id: "mob", name: "Mob", baseHp: 1, reward: 1, itemId: "item-shuriken" }], boss: { id: "boss", name: "Boss", baseHp: 1, reward: 1 } },
        { id: "arc-b", animeId: "b", name: "B", order: 0, mobsToBoss: 1, mobs: [{ id: "mob-b", name: "Mob", baseHp: 1, reward: 1, itemId: "item-ration" }], boss: { id: "boss-b", name: "Boss", baseHp: 1, reward: 1 } },
      ],
      items: [
        { id: "item-shuriken", name: "Shuriken", kind: "common" as const },
        { id: "item-ration", name: "Ration", kind: "common" as const },
      ],
      characters: [],
    };

    expect(imagePathsForAnime(data, "a")).toEqual(["/a.jpg", "/items/item-shuriken.png"]);
  });

  it("gives every Bleach common item its own illustration", () => {
    const bleachArcIds = new Set(gameData.arcs.filter((arc) => arc.animeId === "bleach").map((arc) => arc.id));
    const commonIds = gameData.arcs
      .filter((arc) => bleachArcIds.has(arc.id))
      .flatMap((arc) => arc.mobs.map((mob) => mob.itemId))
      .filter((itemId): itemId is string => Boolean(itemId));

    expect(new Set(commonIds).size).toBe(15);
    for (const itemId of new Set(commonIds)) {
      expect(itemImagePath(itemId, "common")).toBe(`/items/${itemId}.png`);
    }
  });
});

describe("preload paths", () => {
  it("keeps the optional prestige art out of the startup batch", () => {
    expect(STARTUP_IMAGE_PATHS).not.toContain("/prestige-tree-background.png");
    expect(PRESTIGE_IMAGE_PATHS).toContain("/prestige-tree-background.png");
  });
});

describe("progressive disclosure", () => {
  it("starts with every secondary system hidden", () => {
    expect(Object.values(deriveDisclosure(emptyDisclosureFacts, 250))).not.toContain(true);
  });

  it("reveals learned systems from lifetime facts so prestige cannot hide them again", () => {
    const state = deriveDisclosure(
      {
        ...emptyDisclosureFacts,
        recruits: 1,
        abilitiesActivated: 1,
        bossesKilled: 1,
        arcsCleared: 1,
        prestiges: 1,
        packsOpened: 1,
        crossoversActivated: 1,
      },
      250
    );

    expect(state).toMatchObject({
      team: true,
      abilities: true,
      items: true,
      codex: true,
      worlds: true,
      shop: true,
      achievements: true,
      prestige: true,
      challenges: true,
      packs: true,
      crossover: true,
    });
  });

  it("waits until a pack is affordable before revealing its currency", () => {
    expect(deriveDisclosure({ ...emptyDisclosureFacts, maxWorldPoints: 249 }, 250).packs).toBe(false);
    expect(deriveDisclosure({ ...emptyDisclosureFacts, maxWorldPoints: 250 }, 250).packs).toBe(true);
  });
});

describe("first-run objective trail", () => {
  const facts: ObjectiveFacts = {
    recruits: 0,
    arcsCleared: 0,
    passiveRanksBought: 0,
    arcName: "Le premier arc",
    arcKills: 0,
    arcKillsNeeded: 14,
    itemName: "Shuriken émoussé",
    itemArcName: "Le premier arc",
    itemCopies: 0,
    passiveCharacterName: "Sakura Haruno",
  };

  it("walks through recruit, arc, copies and passive in order", () => {
    expect(tutorialObjective(facts)?.step).toBe(1);
    expect(tutorialObjective({ ...facts, recruits: 1 })?.step).toBe(2);
    expect(tutorialObjective({ ...facts, recruits: 1, arcsCleared: 1 })?.step).toBe(3);
    expect(tutorialObjective({ ...facts, recruits: 1, arcsCleared: 1, itemCopies: 6 })?.step).toBe(4);
    expect(
      tutorialObjective({ ...facts, recruits: 1, arcsCleared: 1, itemCopies: 6, passiveRanksBought: 1 })
    ).toBeNull();
  });

  it("stays complete after the passive is bought even though buying it spent the copies", () => {
    // Buying the passive drains the item copies below 6; the tutorial must not regress to step 3.
    expect(
      tutorialObjective({ ...facts, recruits: 1, arcsCleared: 1, itemCopies: 0, passiveRanksBought: 1 })
    ).toBeNull();
  });

  it("names the current arc, common item and compatible character", () => {
    expect(tutorialObjective({ ...facts, recruits: 1 })?.title).toContain("Le premier arc");
    expect(tutorialObjective({ ...facts, recruits: 1, arcsCleared: 1 })?.title).toContain("Shuriken émoussé");
    expect(tutorialObjective({ ...facts, recruits: 1, arcsCleared: 1, itemCopies: 6 })?.detail).toContain(
      "Sakura Haruno"
    );
  });
});

describe("boss advice", () => {
  const base = {
    teamSize: 1,
    affordablePassive: false,
    equippableUnique: false,
    readyAbility: false,
    isActiveArc: true,
  };

  it("prioritizes actions the player can take immediately", () => {
    expect(bossAdvice({ ...base, teamSize: 0 }).short).toBe("Recrute un héros");
    expect(bossAdvice({ ...base, affordablePassive: true }).short).toBe("Améliore un passif");
    expect(bossAdvice({ ...base, equippableUnique: true }).short).toBe("Équipe un objet");
    expect(bossAdvice({ ...base, readyAbility: true }).short).toBe("Lance une capacité");
  });

  it("sends the player farming when no immediate upgrade exists", () => {
    expect(bossAdvice({ ...base, isActiveArc: false }).short).toBe("Farme l’arc actuel");
    expect(bossAdvice(base).short).toBe("Gagne des niveaux");
  });

  it("gives one concrete counter for every experimental boss trait", () => {
    expect(bossTraitCounter("click-resistance")).toContain("DPS de l’équipe");
    expect(bossTraitCounter("dps-resistance")).toContain("Clique activement");
    expect(bossTraitCounter("shield")).toContain("davantage de PV");
  });
});

describe("unlock notices", () => {
  it("announces only surfaces that just became visible", () => {
    const before = deriveDisclosure(emptyDisclosureFacts, 100);
    const after = deriveDisclosure({ ...emptyDisclosureFacts, kills: 1, recruits: 1, ownedCharacters: 1 }, 100);
    expect(newlyUnlocked(before, after)).toEqual([
      "Ressources débloquées",
      "Équipe et Codex débloqués",
    ]);
    expect(newlyUnlocked(after, after)).toEqual([]);
  });

  it("groups the world portal and shop into one announcement", () => {
    const before = deriveDisclosure(emptyDisclosureFacts, 100);
    const after = deriveDisclosure({ ...emptyDisclosureFacts, arcsCleared: 1 }, 100);
    expect(newlyUnlocked(before, after)).toContain("Portail des mondes et boutique débloqués");
  });
});
