import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { Character } from "../engine/types";
import { LEVEL_DAMAGE_STEP, passiveGrowth } from "../engine/growth";
import { DUPLICATE_DAMAGE_STEP, duplicateGrowth } from "../engine/packs";
import { scaledUniqueEffect } from "../engine/forge";
import ItemCodex from "./ItemCodex";
import ItemIcon from "./ItemIcon";
import Sprite from "./Sprite";
import { describeAbility, describeCharacterTag, describeModifier } from "./describe";
import { fmt } from "./format";
import { themeOf } from "./hue";
import { IconChevronLeft, IconStar, IconStarOutline } from "./icons";

const RARITY_LABEL: Record<Character["rarity"], string> = {
  main: "Personnage principal",
  secondary: "Personnage secondaire",
};

/**
 * The player first picks an anime, then browses only that world's characters and items. A direct
 * link from the roster skips the picker but stays inside the same scoped view.
 */
export default function Codex(props: { game: GameStore; onClose: () => void; initialSelectedId?: string }) {
  const initialCharacter = () => props.game.characterOf(props.initialSelectedId);
  const [selectedAnimeId, setSelectedAnimeId] = createSignal<string | undefined>(initialCharacter()?.animeId);
  const [selectedId, setSelectedId] = createSignal(props.initialSelectedId ?? "");
  const [tab, setTab] = createSignal<"characters" | "items">("characters");

  const selectedAnime = createMemo(() => props.game.animeOf(selectedAnimeId()));
  const characters = createMemo(() =>
    props.game.data.characters.filter((character) => character.animeId === selectedAnimeId()),
  );
  const selected = createMemo(() => characters().find((c) => c.id === selectedId()));
  const owned = (character: Character) => props.game.ownedCharacterIds().includes(character.id);
  /** Ce qui multiplie la stat imprimée hors niveaux : doublons de packs et rattrapage d'histoire. */
  const rampOf = (character: Character) =>
    props.game.catchUpOf(character) * duplicateGrowth(props.game.duplicatesOf(character.id));

  /** Un passif prêt à monter, sur ce personnage ou quelque part dans ce monde : la même pastille. */
  const rankable = (character: Character) => props.game.rankablePassiveIds().has(character.id);
  const animeRankable = (animeId: string) =>
    props.game.data.characters.some((character) => character.animeId === animeId && rankable(character));

  const animeName = (animeId: string) => props.game.animeOf(animeId)?.name ?? animeId;
  const arcNames = (character: Character) =>
    character.arcIds.map((id) => props.game.arcOf(id)?.name ?? id);
  /**
   * Les arcs du personnage où l'on peut se rendre tout de suite. `playableArcs` porte déjà les deux
   * conditions (monde débloqué, arc ouvert), donc le Codex n'en re-décide aucune.
   */
  const reachableArcs = (character: Character) =>
    props.game.playableArcs().filter((arc) => character.arcIds.includes(arc.id));
  /** Emmène le joueur sur l'arc et referme le Codex : c'est un déplacement, pas une lecture. */
  function goToArc(arcId: string) {
    if (props.game.setActiveArc(arcId)) props.onClose();
  }
  const laterAnimeNames = (character: Character) =>
    [...new Set([...(character.appearanceAnimeIds ?? []), ...(character.fullSynergyAnimeIds ?? [])])].map(animeName);
  const itemsOf = (animeId: string) => {
    const itemIds = new Set(
      props.game.data.arcs
        .filter((arc) => arc.animeId === animeId)
        .flatMap((arc) => [...arc.mobs.map((mob) => mob.itemId), arc.boss.itemId])
        .filter((id): id is string => !!id),
    );
    return props.game.data.items.filter((item) => itemIds.has(item.id));
  };

  function chooseAnime(animeId: string) {
    setSelectedAnimeId(animeId);
    setSelectedId(props.game.data.characters.find((character) => character.animeId === animeId)?.id ?? "");
    setTab("characters");
  }

  function returnToAnimePicker() {
    setSelectedAnimeId(undefined);
    setSelectedId("");
  }

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
      <div
        class="modal codex-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Codex"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="panel-head">
          <span>
            <Show when={selectedAnime()} fallback="Codex — Choisir un anime">
              {(anime) => `Codex — ${anime().name}`}
            </Show>
          </span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <Show
          when={selectedAnime()}
          fallback={
            <div class="codex-anime-picker scroll">
              <p class="muted">Choisissez l'anime dont vous voulez consulter le Codex.</p>
              <div class="codex-anime-grid">
                <For each={props.game.data.animes}>
                  {(anime) => {
                    const animeCharacters = () =>
                      props.game.data.characters.filter((character) => character.animeId === anime.id);
                    const animeItems = () => itemsOf(anime.id);
                    const metCount = () =>
                      animeCharacters().filter((character) => props.game.ownedCharacterIds().includes(character.id)).length;
                    const foundCount = () => animeItems().filter((item) => props.game.countOf(item.id) > 0).length;
                    return (
                      <button
                        class="codex-anime-card"
                        style={{ "--world-hue": themeOf(anime) }}
                        onClick={() => chooseAnime(anime.id)}
                      >
                        <Sprite name={anime.name} kind="anime" px={7} />
                        <span class="codex-anime-copy">
                          <strong>
                            {anime.name}
                            <Show when={animeRankable(anime.id)}>
                              <span class="notice-dot" aria-label="Un passif peut être amélioré" role="img" />
                            </Show>
                          </strong>
                          <small class="muted">
                            {metCount()} / {animeCharacters().length} personnages
                          </small>
                          <small class="muted">
                            {foundCount()} / {animeItems().length} objets
                          </small>
                        </span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          }
        >
          {(anime) => (
            <>
              <div class="codex-toolbar">
                <button class="codex-back" onClick={returnToAnimePicker}>
                  <IconChevronLeft />
                  Animes
                </button>
                <div class="tabs">
                  <button classList={{ active: tab() === "characters" }} onClick={() => setTab("characters")}>
                    Personnages ({characters().length})
                  </button>
                  <button classList={{ active: tab() === "items" }} onClick={() => setTab("items")}>
                    Objets ({itemsOf(anime().id).length})
                  </button>
                </div>
              </div>

              <div class="codex">
                <Show when={tab() === "characters"} fallback={<ItemCodex game={props.game} animeId={anime().id} />}>
          <div class="codex-list scroll">
                  <div class="codex-group">{anime().name}</div>
                  <For each={characters()}>
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
                          load
                        />
                        <span class="name">{character.name}</span>
                        <Show when={rankable(character)}>
                          <span class="notice-dot push" aria-label="Un passif peut être amélioré" role="img" />
                        </Show>
                        <span class="rarity">{character.rarity === "main" ? <IconStar /> : <IconStarOutline />}</span>
                      </button>
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

                {/* Le Codex dit déjà où se trouve un personnage : autant y emmener. Seuls les arcs
                    atteignables deviennent un bouton — le bloc Synergie donne la liste complète. */}
                <Show when={reachableArcs(character()).length > 0}>
                  <div class="codex-travel">
                    <span class="muted small">{owned(character()) ? "Combattre dans" : "Le rencontrer dans"}</span>
                    <For each={reachableArcs(character())}>
                      {(arc) => (
                        <button
                          class="codex-travel-arc"
                          classList={{ active: props.game.activeArc()?.id === arc.id }}
                          onClick={() => goToArc(arc.id)}
                        >
                          {arc.name}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>

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

                {/* L'objet porté agissait sur « Actuel » sans être nommé nulle part dans la fiche :
                    on lisait la stat sans sa cause. Ici on le voit, avec son effet au niveau de
                    forge du moment. Réservé à l'équipe : un unique ne s'équipe que sur une recrue. */}
                <Show when={owned(character())}>
                  <div class="codex-block">
                    <h4>Équipement</h4>
                    <Show
                      when={props.game.equippedItemOf(character())}
                      fallback={
                        <p class="muted small">Aucun objet équipé. Les uniques se posent depuis le panneau Équipe.</p>
                      }
                    >
                      {(item) => (
                        <>
                          <div class="codex-row">
                            <span class="muted">
                              <ItemIcon id={item().id} kind="unique" /> {item().name}
                            </span>
                            <strong>
                              {(item().effects ?? [])
                                .map((effect) =>
                                  describeModifier(scaledUniqueEffect(effect, props.game.uniqueUpgradeLevelOf(item().id)))
                                )
                                .join(" · ") || "aucun effet"}
                            </strong>
                          </div>
                          <Show when={props.game.uniqueUpgradeLevelOf(item().id) > 0}>
                            <div class="codex-row">
                              <span class="muted">Forge</span>
                              {/* Même formulation que la Forge : un niveau sur 5 et une puissance en
                                  pourcentage — « x0.67 sur l'effet » se lisait comme un malus. */}
                              <strong>
                                niveau {props.game.uniqueUpgradeLevelOf(item().id)}/5 · puissance{" "}
                                {Math.round(props.game.uniqueUpgradeMultiplierOf(item().id) * 100)} %
                              </strong>
                            </div>
                          </Show>
                        </>
                      )}
                    </Show>
                  </div>
                </Show>

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
                    <Show when={laterAnimeNames(character()).length > 0}>
                      {" "}Toujours présent dans : {laterAnimeNames(character()).join(", ")} ; ses capacités y restent disponibles.
                    </Show>
                    <Show when={character().fullSynergyAnimeIds?.length}>
                      {" "}Synergie maximale dans tout {character().fullSynergyAnimeIds!.map(animeName).join(", ")}.
                    </Show>
                    <Show when={props.game.crossoverActive()}> Crossover actif : les malus sont annulés.</Show>
                  </p>
                </div>
              </div>
            )}
          </Show>
                </Show>
              </div>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
