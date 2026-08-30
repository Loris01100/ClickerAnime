import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const SAVE_KEY = "clicker-anime:save:v10";
const BACKUP_KEY = `${SAVE_KEY}:backup`;

async function exportedSave(page: Page): Promise<Record<string, any>> {
  await page.locator("summary", { hasText: "Menu" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Le téléchargement de la sauvegarde n’a produit aucun fichier.");
  return JSON.parse(Buffer.from(await readFile(path, "utf8"), "base64").toString("utf8"));
}

async function importSave(page: Page, save: Record<string, any>) {
  const encoded = Buffer.from(JSON.stringify(save), "utf8").toString("base64");
  const navigation = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
  await page.locator('input[type="file"]').setInputFiles({
    name: "parcours-complet.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(encoded),
  });
  await navigation;
  await page.waitForLoadState("domcontentloaded");
  await expect
    .poll(async () => {
      try {
        return await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.currency, SAVE_KEY);
      } catch {
        return undefined;
      }
    })
    .toBe(save.currency);
}

/**
 * Drive the real combat surface until one visible game outcome is reached. The short waits are
 * intentional: kills are capped per second, so a synthetic wall of instantaneous clicks would
 * only test that the cap refuses them instead of playing the arc like a browser does.
 */
async function fightUntil(page: Page, label: string, done: () => Promise<boolean>, rounds = 240) {
  const stage = page.getByLabel("Clic du Narrateur");
  for (let round = 0; round < rounds; round++) {
    if (await done()) return;
    await stage.click({ clickCount: 5, delay: 5 });
    await page.waitForTimeout(75);
  }
  throw new Error(`Le combat n'a pas atteint « ${label} » après ${rounds} séries de clics.`);
}

test("joue réellement le premier arc de Naruto jusqu'au boss et ouvre le suivant", async ({ page }) => {
  test.setTimeout(60_000);

  // Drops are the only random part of this journey. Pinning the roll keeps the browser test
  // repeatable while every state transition still goes through the visible game actions.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Refuser" }).click();

  await page.getByRole("button", { name: /Naruto.*Disponible/ }).click();
  await page.getByRole("button", { name: "Partir", exact: true }).click();
  await expect(page.getByText("Recrute ton premier personnage", { exact: true })).toBeVisible();

  const narutoInTeam = page.locator("button.name-link", { hasText: "Naruto Uzumaki" });
  await fightUntil(page, "la première recrue", () => narutoInTeam.isVisible());
  await expect(page.getByText(/Termine Prologue \/ Le Pays des Vagues/)).toBeVisible();

  const activeTrait = page.getByText("Trait actif", { exact: true });
  await fightUntil(page, "le boss Zabuza", () => activeTrait.isVisible());
  await expect(page.locator(".boss-intel.active").getByText("Brume épaisse", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Multiclonage Supra/ }).click();

  const firstArc = page.locator("button.arc", { hasText: "Prologue / Le Pays des Vagues" });
  await fightUntil(page, "la victoire sur le premier arc", async () =>
    (await firstArc.getByText("terminé", { exact: true }).count()) > 0
  );
  await expect(firstArc.getByText("terminé", { exact: true })).toBeVisible();
  await expect(page.locator(".item-row", { hasText: "Kubikiribôchô" })).toBeVisible();

  // The objective trail deliberately keeps "Termine l'arc" in front until the boss falls. With
  // deterministic drops, its six-copy step is already satisfied and it can now teach the spend.
  const affordablePassive = page.locator("button.tutorial-rank-up:enabled");
  const passiveObjective = page.locator(".objective-panel").getByText("Améliore un passif", { exact: true });
  await expect(passiveObjective).toBeVisible();
  await expect(affordablePassive.first()).toBeVisible();
  await affordablePassive.first().click();
  await expect(passiveObjective).toHaveCount(0);

  const secondArc = page.locator("button.arc", { hasText: "L'Examen Chûnin" });
  await expect(secondArc).toBeEnabled();
  await secondArc.click();
  await expect(page.locator(".arc-current")).toHaveText("L'Examen Chûnin");

  // A reload proves that the naturally earned progress crossed the persistence boundary too.
  await page.reload();
  const save = await exportedSave(page);
  expect(save.clearedArcIds).toContain("naruto-vagues");
  expect(save.activeArcId).toBe("naruto-chunin");
  expect(save.ownedCharacterIds).toEqual(
    expect.arrayContaining(["naruto-uzumaki", "sakura-haruno", "kakashi-hatake", "haku"])
  );
  expect(save.itemCounts["item-kubikiri"]).toBe(1);
  expect(Object.values(save.passiveRanks).some((rank) => Number(rank) >= 1)).toBe(true);
});

test("nouvelle partie → export/import → secours → prestige", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Portail des mondes" })).toBeVisible();
  await page.getByRole("button", { name: "Refuser" }).click();

  await page.getByRole("button", { name: "Partir", exact: true }).click();
  await expect(page.getByLabel("Clic du Narrateur")).toBeVisible();
  for (let click = 0; click < 25; click++) await page.getByLabel("Clic du Narrateur").click();

  // pagehide persists the first real browser interaction, exactly like closing the game would.
  await page.reload();
  const initial = await exportedSave(page);
  expect(initial.unlockedAnimeIds).toContain("naruto");
  expect(initial.achievementCounts.mobsKilled).toBeGreaterThanOrEqual(1);

  const progressed = {
    ...initial,
    currency: 123_456,
    lifetimeEarned: 100_000_000,
    ownedCharacterIds: ["naruto-uzumaki"],
    activeArcId: "naruto-vagues",
    prestigePoints: 0,
    unlockedAnimeIds: ["naruto"],
    arcKills: { "naruto-vagues": 5 },
    clearedArcIds: [],
    characterXp: { "naruto-uzumaki": 10_000 },
    itemCounts: { "item-kubikiri": 1 },
    passiveRanks: { "naruto-uzumaki": 5 },
    uniqueUpgradeRanks: { "item-kubikiri": 5 },
    achievementCounts: {
      ...initial.achievementCounts,
      mobsKilled: 20,
      charactersRecruited: 1,
      passiveRanksBought: 5,
      uniquesEquipped: 1,
    },
  };

  await importSave(page, progressed);
  await expect(page.getByRole("button", { name: /Prestige \(\+\d+\)/ })).toBeEnabled();
  expect(await page.evaluate((key) => localStorage.getItem(key) !== null, BACKUP_KEY)).toBe(true);

  // A second tab starts with a damaged primary slot. The app must repair it from the backup before
  // any component reads the save, while keeping the playable page alive.
  const recoveryPage = await context.newPage();
  await recoveryPage.addInitScript((key) => localStorage.setItem(key, "{sauvegarde cassée"), SAVE_KEY);
  await recoveryPage.goto("/");
  await expect(recoveryPage.getByText("Sauvegarde principale réparée depuis la copie de secours")).toBeVisible();
  await expect(recoveryPage.getByLabel("Clic du Narrateur")).toBeVisible();
  await recoveryPage.close();

  // Recovery intentionally restored the earlier run in shared localStorage; import the progressed
  // fixture again, then execute a real prestige through the visible confirmation button.
  await importSave(page, progressed);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Prestige \(\+\d+\)/ }).click();

  const report = page.getByRole("dialog", { name: "Bilan de prestige" });
  await expect(report).toBeVisible();
  await expect(report.getByText("Prestige accompli")).toBeVisible();
  await expect(report.getByText("Maîtrises conservées")).toBeVisible();
  await expect(report.getByText("5 rangs de passif")).toBeVisible();
  await report.getByRole("button", { name: "Fermer" }).click();

  const afterPrestige = await exportedSave(page);
  expect(afterPrestige.ownedCharacterIds).toEqual([]);
  expect(afterPrestige.itemCounts).toEqual({});
  expect(afterPrestige.passiveRanks["naruto-uzumaki"]).toBe(5);
  expect(afterPrestige.uniqueUpgradeRanks["item-kubikiri"]).toBe(5);
  expect(afterPrestige.prestigePoints).toBeGreaterThan(0);

  // Manual recovery is exposed in the same menu as import/export and swaps the slots, so it can
  // itself be undone until the next autosave.
  await page.locator("summary", { hasText: "Menu" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restaurer la copie de secours" }).click();
  await page.waitForLoadState("domcontentloaded");
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.currency, SAVE_KEY)).toBe(
    initial.currency
  );
});
