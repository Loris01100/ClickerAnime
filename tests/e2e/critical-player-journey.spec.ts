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

test("nouvelle partie → export/import → secours → prestige", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Portail des mondes" })).toBeVisible();

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
