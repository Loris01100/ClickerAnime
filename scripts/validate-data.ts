import { gameData } from "../src/data";
import { formatContentIssues, validateGameData } from "../src/engine/dataValidation";

const issues = validateGameData(gameData);
if (issues.length > 0) {
  console.error(`Contenu invalide : ${issues.length} problème${issues.length > 1 ? "s" : ""}.\n`);
  console.error(formatContentIssues(issues));
  process.exitCode = 1;
} else {
  const appearances = gameData.characters.reduce(
    (total, character) => total + (character.appearanceAnimeIds?.length ?? 0),
    0
  );
  console.log(
    `Contenu valide : ${gameData.animes.length} animés, ${gameData.arcs.length} arcs, ` +
      `${gameData.characters.length} personnages, ${appearances} présences dans une suite.`
  );
}
