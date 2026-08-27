import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { Character } from "../engine/types";
import { LEVEL_DAMAGE_STEP, passiveGrowth } from "../engine/growth";
import { DUPLICATE_DAMAGE_STEP, duplicateGrowth } from "../engine/packs";
import ItemCodex from "./ItemCodex";
import Sprite from "./Sprite";
import { describeAbility, describeCharacterTag, describeModifier } from "./describe";
import { fmt } from "./format";
import { IconStar, IconStarOutline } from "./icons";

const RARITY_LABEL: Record<Character["rarity"], string> = {
  main: "Personnage principal",
  secondary: "Personnage secondaire",
};

/**
 * Every character in the game, met or not, with their stats and what their passive actually does —
 * plus a second tab over the same shell listing every item, see `ItemCodex`.
 */
export default function Codex(props: { game: GameStore; onClose: () => void; initialSelectedId?: string }) {
  const [selectedId, setSelectedId] = createSignal(props.initialSelectedId ?? props.game.data.characters[0]?.id ?? "");
  const [tab, setTab] = createSignal<"characters" | "items">("characters");

  const selected = createMemo(() => props.game.data.characters.find((c) => c.id === selectedId()));
  const owned = (character: Character) => props.game.ownedCharacterIds().includes(character.id);
  /** Ce qui multiplie la stat imprimée hors niveaux : doublons de packs et rattrapage d'histoire. */
  const rampOf = (character: Character) =>
    props.game.catchUpOf(character) * duplicateGrowth(props.game.duplicatesOf(character.id));

  const animeName = (animeId: string) => props.game.data.animes.find((a) => a.id === animeId)?.name ?? animeId;
  const arcNames = (character: Character) =>
    character.arcIds.map((id) => props.game.data.arcs.find((a) => a.id === id)?.name ?? id);
  const combosOf = (character: Character) =>
    props.game.data.combos.filter((combo) => combo.requiredCharacterIds.includes(character.id));

  /** The ability currently in effect: the evolved one once grown into, the base one otherwise. */
  const abilityOf = (character: Character) =>
    (props.game.isEvolved(character) && character.evolution?.ability) || character.ability;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Codex" onClick={(e) => e.stopPropagation()}>
        <header class="panel-head">
          <span>
            <Show
              when={tab() === "characters"}
              fallback={`Codex — ${props.game.foundItems().length} / ${props.game.data.items.length} objets trouvés`}
            >
              Codex — {props.game.ownedCharacterIds().length} / {props.game.data.characters.length} rencontrés
            </Show>
          </span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="tabs">
          <button classList={{ active: tab() === "characters" }} onClick={() => setTab("characters")}>
            Personnages
          </button>
          <button classList={{ active: tab() === "items" }} onClick={() => setTab("items")}>
            Objets
          </button>
        </div>

        <div class="codex">
          <Show when={tab() === "characters"} fallback={<ItemCodex game={props.game} />}>
          <div class="codex-list scroll">
            <For each={props.game.data.animes}>
              {(anime) => (
                <>
                  <div class="codex-group">{anime.name}</div>
                  <For each={props.game.data.characters.filter((c) => c.animeId === anime.id)}>
                    {(character) => (
                      <button
                        class="codex-entry"
                        classList={{ active: character.id === selectedId(), unmet: !owned(character) }}
                        onClick={() => setSelectedId(character.id)}
                      >
                        <Sprite
                          name={character.name}
                          kind="character"
                          anime={animeName(character.animeId)}
                          px={3}
                          dim={!owned(character)}
                        />
                        <span class="name">{character.name}</span>
                        <span class="rarity">{character.rarity === "main" ? <IconStar /> : <IconStarOutline />}</span>
                      </button>
                    )}
                  </For>
                </>
              )}
            </For>
          </div>

          <Show when={selected()}>
            {(character) => (
              <div class="codex-detail scroll">
                <div class="codex-hero">
                  <Sprite
                    name={character().name}
                    kind="character"
                    anime={animeName(character().animeId)}
                    px={10}
                    dim={!owned(character())}
                  />
                  <div>
                    <h3>{character().name}</h3>
                    <p class="muted small">
                      {RARITY_LABEL[character().rarity]} · {animeName(character().animeId)}
                    </p>
                    <Show when={character().tags?.length}>
                      <p class="small">Type : {character().tags!.map(describeCharacterTag).join(" · ")}</p>
                    </Show>
                    <p class="small" classList={{ muted: !owned(character()) }}>
                      {owned(character())
                        ? `Dans l'équipe · niveau ${props.game.levelOf(character().id)}`
                        : "Pas encore rencontré"}
                    </p>
                  </div>
                </div>

                <div class="codex-block">
                  <h4>Statistiques</h4>
                  <div class="codex-row">
                    <span class="muted">Clic (niveau 0)</span>
                    <strong>{fmt(character().baseClickPower)}</strong>
                  </div>
                  <div class="codex-row">
                    <span class="muted">DPS (niveau 0)</span>
                    <strong>{fmt(character().baseDps)}</strong>
                  </div>
                  <div class="codex-row">
                    <span class="muted">Gain par niveau</span>
                    {/* Un niveau vaut LEVEL_DAMAGE_STEP fois la stat de base, pas la stat entière —
                        c'est `levelGrowth` qui fait foi. Affiché en dur, ça surestimait de 67 %.
                        Le rattrapage multiplie cette stat de base : sans lui la ligne annonçait un
                        gain par niveau des dizaines de fois trop petit face à « Actuel ». */}
                    <strong>
                      +{fmt(character().baseClickPower * rampOf(character()) * LEVEL_DAMAGE_STEP)} clic /{" "}
                      +{fmt(character().baseDps * rampOf(character()) * LEVEL_DAMAGE_STEP)} dps
                    </strong>
                  </div>
                  <Show when={props.game.catchUpOf(character()) > 1}>
                    <div class="codex-row">
                      <span class="muted">Rattrapage (ramp de l'histoire)</span>
                      <strong>x{props.game.catchUpOf(character()).toFixed(1)} sur les stats de base</strong>
                    </div>
                  </Show>
                  <Show when={props.game.duplicatesOf(character().id) > 0}>
                    <div class="codex-row">
                      <span class="muted">Doublons (packs)</span>
                      <strong>
                        x{props.game.duplicatesOf(character().id)} — +
                        {Math.round(props.game.duplicatesOf(character().id) * DUPLICATE_DAMAGE_STEP * 100)} % dégâts
                      </strong>
                    </div>
                  </Show>
                  <Show when={owned(character())}>
                    <div class="codex-row">
                      <span class="muted">Actuel</span>
                      {/* Même chiffre que la ligne du panel Équipe : niveaux, doublons, passif,
                          objet équipé et buffs en cours — le passif est scopé sur le personnage,
                          il compte donc dans ses stats à lui. Hors synergie. */}
                      <strong>
                        {fmt(props.game.characterStatOf(character(), "clickPower"))} clic /{" "}
                        {fmt(props.game.characterStatOf(character(), "teamDps"))} dps
                      </strong>
                    </div>
                  </Show>
                </div>

                <div class="codex-block">
                  <h4>Passif</h4>
                  <Show when={character().passive} fallback={<p class="muted small">Aucun passif.</p>}>
                    {(passive) => {
                      const cap = () => props.game.passiveCapOf(character());
                      const atCap = () => ({ ...passive(), value: passive().value * passiveGrowth(cap()) });
                      const rank = () => props.game.passiveRankOf(character());
                      const upgrade = () => props.game.passiveUpgradeOf(character());
                      const current = () => ({
                        ...passive(),
                        value: passive().value * passiveGrowth(rank()),
                      });
                      return (
                        <>
                          <div class="codex-row">
                            <span class="muted">Rang 1</span>
                            <strong>{describeModifier(passive())}</strong>
                          </div>
                          <div class="codex-row">
                            <span class="muted">Au maximum (rang {cap()})</span>
                            <strong>{describeModifier(atCap())}</strong>
                          </div>
                          <Show when={owned(character())}>
                            <div class="codex-row">
                              <span class="muted">Actuel (rang {rank()})</span>
                              <strong>{rank() > 0 ? describeModifier(current()) : "verrouillé"}</strong>
                            </div>
                            {/* Same widget as the roster's team rows — the Codex is where the passive
                                is read in full, so it is also where it should be bought. */}
                            <div class="codex-row">
                              <span class="muted">Rang suivant</span>
                              <Show when={!upgrade().maxed} fallback={<small class="capped">max</small>}>
                                <button
                                  class="rank-up"
                                  disabled={!upgrade().affordable}
                                  onClick={() => props.game.rankUpPassive(character())}
                                >
                                  +1 · {fmt(upgrade().copies)}/{fmt(upgrade().cost)}{" "}
                                  {props.game.passiveItemOf(character())?.name ?? "—"}
                                </button>
                              </Show>
                            </div>
                          </Show>
                          <p class="muted small">
                            Le passif se monte en dépensant « {props.game.passiveItemOf(character())?.name ?? "—"} »,
                            l'objet commun de son arc d'origine, et s'arrête au rang {cap()}. Il ne s'applique
                            qu'aux statistiques de ce personnage, pas à celles de l'équipe. Les niveaux, eux,
                            n'ajoutent que des dégâts.
                          </p>
                        </>
                      );
                    }}
                  </Show>
                </div>

                <Show when={abilityOf(character())}>
                  {(ability) => (
                    <div class="codex-block">
                      <h4>Capacité — {ability().name}</h4>
                      {/* Même magnitude que la barre de capacités : un buff est mis à l'échelle
                          avant d'atterrir, donc la valeur brute de la donnée sous-estime — et le
                          Codex et la barre annonçaient deux chiffres pour la même capacité. */}
                      <p class="small">{describeAbility(ability(), props.game.abilityMagnitudeOf(ability()))}</p>
                      <Show when={props.game.isEvolved(character()) && character().evolution?.ability}>
                        <p class="muted small">Version évoluée ({character().evolution?.label}).</p>
                      </Show>
                    </div>
                  )}
                </Show>

                <Show when={character().evolution}>
                  {(evolution) => (
                    <div class="codex-block">
                      <h4>Évolution — {evolution().label}</h4>
                      <p class="muted small">
                        Se déclenche en combattant dans {animeName(evolution().animeId)} une fois ce
                        personnage recruté, et reste acquise pour le reste de la partie.
                      </p>
                      <For each={evolution().bonus}>
                        {(bonus) => (
                          <div class="codex-row">
                            <span class="muted">Bonus</span>
                            <strong>{describeModifier(bonus)}</strong>
                          </div>
                        )}
                      </For>
                      <Show when={owned(character())}>
                        <p class="small" classList={{ muted: !props.game.isEvolved(character()) }}>
                          {props.game.isEvolved(character()) ? "Évolution acquise." : "Pas encore déclenchée."}
                        </p>
                      </Show>
                    </div>
                  )}
                </Show>

                <Show when={combosOf(character()).length > 0}>
                  <div class="codex-block">
                    <h4>Combos</h4>
                    <For each={combosOf(character())}>
                      {(combo) => (
                        <div class="codex-combo">
                          <strong class="small">{combo.name}</strong>
                          <p class="muted small">
                            Avec{" "}
                            {combo.requiredCharacterIds
                              .filter((id) => id !== character().id)
                              .map((id) => props.game.data.characters.find((c) => c.id === id)?.name ?? id)
                              .join(", ")}
                          </p>
                          <p class="small">
                            {describeAbility(combo.ability, props.game.abilityMagnitudeOf(combo.ability))}
                          </p>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <div class="codex-block">
                  <h4>Synergie</h4>
                  {/* Les malus en vigueur, pas ceux de la donnée : « Cohésion inter-mondes » les
                      adoucit et un crossover les annule, et le Codex affichait 85 % / 50 % quoi
                      qu'il arrive. */}
                  <p class="muted small">
                    Fort dans : {arcNames(character()).join(", ") || "aucun arc"}. Ailleurs dans{" "}
                    {animeName(character().animeId)} ses stats tombent à{" "}
                    {Math.round(props.game.synergyConfig().sameAnimeMalus * 100)} %, et dans un autre anime à{" "}
                    {Math.round(props.game.synergyConfig().otherAnimeMalus * 100)} %.
                    <Show when={props.game.crossoverActive()}> Crossover actif : les malus sont annulés.</Show>
                  </p>
                </div>
              </div>
            )}
          </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}
