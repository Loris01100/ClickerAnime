import { For, Show, createMemo, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { SCOPED_BUFF_CAP } from "../engine/modifiers";
import { passiveGrowth } from "../engine/growth";
import type { Character, Item } from "../engine/types";
import PanelTitle from "./PanelTitle";
import Sprite from "./Sprite";
import { describeAbility, describeItem, describeModifier } from "./describe";
import { fmt, seconds } from "./format";
import ItemIcon from "./ItemIcon";
import { IconGear, IconStar, IconStarOutline } from "./icons";

type SortKey = "level" | "click" | "dps" | "synergy";

const SORTS: Record<SortKey, { label: string; value: (game: GameStore, c: Character) => number }> = {
  level: { label: "Niveau", value: (game, c) => game.levelOf(c.id) },
  click: { label: "Clic", value: (game, c) => game.characterStatOf(c, "clickPower") },
  dps: { label: "DPS", value: (game, c) => game.characterStatOf(c, "teamDps") },
  synergy: { label: "Synergie", value: (game, c) => game.synergyOf(c) },
};

type ItemSortKey = "name" | "count" | "kind";

/**
 * Tri de la collection d'objets. Comparateurs plutôt que la table `value`/`sort` de l'équipe :
 * ce qu'on trie ici n'est pas toujours un nombre, et « uniques d'abord » se départage ensuite par
 * nom — un tri sur un seul booléen laisserait la liste se réordonner au gré des trouvailles.
 */
const ITEM_SORTS: Record<ItemSortKey, { label: string; compare: (game: GameStore, a: Item, b: Item) => number }> = {
  name: { label: "Nom", compare: (_, a, b) => a.name.localeCompare(b.name, "fr") },
  count: { label: "Qté", compare: (game, a, b) => game.countOf(b.id) - game.countOf(a.id) || a.name.localeCompare(b.name, "fr") },
  kind: {
    label: "Type",
    compare: (_, a, b) => Number(b.kind === "unique") - Number(a.kind === "unique") || a.name.localeCompare(b.name, "fr"),
  },
};

const pct = (into: number, need: number) => (need > 0 ? Math.min(100, (into / need) * 100) : 0);

/**
 * The sort and the world filter are a view preference, not game state: they live in `localStorage`
 * on their own rather than in the save, so they survive a reload (and a prestige) without adding a
 * field to `SaveFile`. A missing or unreadable value just falls back to the default.
 */
const VIEW_KEY = "clicker-anime:roster-view:v1";
function readView(): { sort: SortKey; world: string; itemSort: ItemSortKey; itemKind: string } {
  const fallback = { sort: "level" as SortKey, world: "", itemSort: "name" as ItemSortKey, itemKind: "" };
  try {
    const parsed = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null");
    if (parsed && typeof parsed.sort === "string" && typeof parsed.world === "string") {
      // Chaque champ retombe seul sur son défaut : une préférence ajoutée après coup est absente
      // des valeurs déjà écrites, et ne doit pas invalider celles qui s'y trouvent.
      return {
        sort: parsed.sort in SORTS ? parsed.sort : fallback.sort,
        world: parsed.world,
        itemSort: parsed.itemSort in ITEM_SORTS ? parsed.itemSort : fallback.itemSort,
        itemKind: parsed.itemKind === "unique" || parsed.itemKind === "common" ? parsed.itemKind : "",
      };
    }
  } catch {
    /* private mode, blocked storage, malformed value — the default is always fine */
  }
  return fallback;
}

/** Left column: abilities, the sortable team list, and the item collection. */
export default function RosterPanel(props: { game: GameStore; onSelectCharacter?: (id: string) => void }) {
  const view = readView();
  const [sortKey, setSortKey] = createSignal<SortKey>(view.sort);
  /** "" = tous les mondes. Le filtre devient indispensable à 60+ personnages. */
  const [worldFilter, setWorldFilter] = createSignal(view.world);
  const [itemSortKey, setItemSortKey] = createSignal<ItemSortKey>(view.itemSort);
  /** "" = les deux types. */
  const [itemKindFilter, setItemKindFilter] = createSignal(view.itemKind);

  function persistView() {
    try {
      localStorage.setItem(
        VIEW_KEY,
        JSON.stringify({ sort: sortKey(), world: worldFilter(), itemSort: itemSortKey(), itemKind: itemKindFilter() })
      );
    } catch {
      /* storage full or blocked: the preference simply isn't remembered */
    }
  }
  const [abilitiesOpen, setAbilitiesOpen] = createSignal(true);
  const [teamOpen, setTeamOpen] = createSignal(true);
  const [itemsOpen, setItemsOpen] = createSignal(true);
  const [recruitsOpen, setRecruitsOpen] = createSignal(true);
  let abilitiesPanel: HTMLElement | undefined;
  let teamPanel: HTMLElement | undefined;
  let itemsPanel: HTMLElement | undefined;

  const animeNameOf = (animeId: string) => props.game.data.animes.find((a) => a.id === animeId)?.name ?? animeId;

  const sortedTeam = createMemo(() =>
    props.game
      .ownedCharacters()
      .filter((c) => !worldFilter() || c.animeId === worldFilter())
      .sort((a, b) => SORTS[sortKey()].value(props.game, b) - SORTS[sortKey()].value(props.game, a))
  );

  /** Only worlds the team actually draws from — an empty filter option would be a dead end. */
  const teamWorlds = createMemo(() => {
    const ids = new Set(props.game.ownedCharacters().map((c) => c.animeId));
    return props.game.data.animes.filter((a) => ids.has(a.id));
  });

  /**
   * Ready abilities first, everything else in roster order. With every ability now usable (they
   * stack instead of locking each other out) the bar is long, and what the player wants at the top
   * is "what can I fire right now". Deliberately a *binary* key rather than the exact cooldown
   * left: sorting by remaining ms would reshuffle the whole bar on every 200ms tick, sliding
   * buttons out from under the cursor.
   */
  const sortedAbilities = createMemo(() => {
    const ready = (u: { ability: { id: string } }) => (props.game.abilityCooldownRemaining(u.ability.id) > 0 ? 1 : 0);
    return [...props.game.unlockedAbilities()].sort((a, b) => ready(a) - ready(b));
  });

  const shownItems = createMemo(() =>
    props.game
      .foundItems()
      .filter((item) => !itemKindFilter() || item.kind === itemKindFilter())
      .sort((a, b) => ITEM_SORTS[itemSortKey()].compare(props.game, a, b))
  );

  const equippableUniques = (character: Character): Item[] =>
    props.game
      .foundItems()
      .filter((item): item is Item => item.kind === "unique" && props.game.canEquipItem(character, item.id));

  return (
    <div class="column">
      <section ref={abilitiesPanel} class="panel roster-resizable-panel" classList={{ collapsed: !abilitiesOpen() }}>
        <header class="panel-head">
          <PanelTitle onToggle={() => { abilitiesPanel?.style.removeProperty("height"); setAbilitiesOpen(!abilitiesOpen()); }} open={abilitiesOpen()}>
            Capacités
          </PanelTitle>
          <span
            class="buff-cap"
            title={`Maîtrise : un buff peut porter un personnage jusqu'à x${Math.round(
              props.game.buffCap()
            )} de ses dégâts de base. Elle monte à chaque arc terminé, jusqu'à x${SCOPED_BUFF_CAP} sur le dernier.`}
          >
            Maîtrise x{Math.round(props.game.buffCap())}
          </span>
          <button
            class="fire-all"
            disabled={props.game.readyAbilities().length === 0}
            title="Lance toutes les capacités prêtes — elles se cumulent, chacune sur ses propres personnages."
            onClick={() => props.game.activateReadyAbilities()}
          >
            Tout lancer {props.game.readyAbilities().length}/{props.game.unlockedAbilities().length}
          </button>
        </header>
        <Show when={abilitiesOpen()}>
          <div class="ability-bar">
            <For each={sortedAbilities()}>
              {(unlocked) => {
                const remaining = () => props.game.abilityCooldownRemaining(unlocked.ability.id);
                const running = () => props.game.activeBuffs().includes(unlocked.ability.id);
                const label = () => (running() ? "actif" : remaining() > 0 ? seconds(remaining()) : "Prêt");
                /**
                 * A buff only boosts the characters it comes from, so no ability ever locks another
                 * one out any more — but which allies it lands on is now worth saying.
                 */
                const targets = () =>
                  unlocked.characterIds
                    .map((id) => props.game.data.characters.find((c) => c.id === id)?.name ?? id)
                    .join(", ");
                const tooltip = () =>
                  [
                    unlocked.ability.name,
                    describeAbility(unlocked.ability, props.game.abilityMagnitudeOf(unlocked.ability)),
                    `Cible : ${targets()}`,
                    // What lands can be less than the line above: the maîtrise ceiling bites long
                    // before the printed value does, and hiding it made every ability read alike.
                    `Maîtrise : x${Math.round(props.game.buffCap())} au maximum par personnage`,
                  ].join("\n");
                return (
                  <button
                    class="ability"
                    classList={{ running: running() }}
                    disabled={remaining() > 0}
                    title={tooltip()}
                    onClick={() => props.game.activateAbility(unlocked.ability.id)}
                  >
                    <span class="ability-name">{unlocked.ability.name}</span>
                    <span class="ability-cd">{label()}</span>
                  </button>
                );
              }}
            </For>
            <Show when={props.game.unlockedAbilities().length === 0}>
              <p class="muted pad">Battez des personnages pour débloquer des capacités et des combos.</p>
            </Show>
          </div>
        </Show>
      </section>

      <section ref={teamPanel} class="panel roster-resizable-panel" classList={{ collapsed: !teamOpen() }}>
        <header class="panel-head">
          <PanelTitle onToggle={() => { teamPanel?.style.removeProperty("height"); setTeamOpen(!teamOpen()); }} open={teamOpen()}>
            Équipe ({sortedTeam().length}
            <Show when={worldFilter()}>/{props.game.ownedCharacters().length}</Show>)
          </PanelTitle>
          <Show when={teamWorlds().length > 1}>
            <select
              value={worldFilter()}
              title="Filtrer l'équipe par monde"
              onChange={(e) => {
                setWorldFilter(e.currentTarget.value);
                persistView();
              }}
            >
              <option value="">Tous les mondes</option>
              <For each={teamWorlds()}>{(anime) => <option value={anime.id}>{anime.name}</option>}</For>
            </select>
          </Show>
          <select
            value={sortKey()}
            onChange={(e) => {
              setSortKey(e.currentTarget.value as SortKey);
              persistView();
            }}
          >
            <For each={Object.entries(SORTS)}>{([key, sort]) => <option value={key}>{sort.label}</option>}</For>
          </select>
        </header>

        <Show when={teamOpen()}>
        <div class="table-head member-grid">
          <span>Nom</span>
          <span>Niv.</span>
          <span>Clic</span>
          <span>DPS</span>
          <span>Syn.</span>
        </div>

        <div class="scroll">
          <For each={sortedTeam()}>
            {(character) => {
              const progress = () => props.game.progressOf(character.id);
              const level = () => progress().level;
              const passive = () => props.game.passiveUpgradeOf(character);
              const passiveItem = () => props.game.passiveItemOf(character);
              return (
                <div class="member">
                  <div class="member-grid">
                    <button
                      class="name name-link"
                      title="Voir dans le Codex"
                      onClick={() => props.onSelectCharacter?.(character.id)}
                    >
                      <Sprite name={character.name} kind="character" anime={animeNameOf(character.animeId)} px={5} />
                      {character.name}
                      <span class="rarity">{character.rarity === "main" ? <IconStar /> : <IconStarOutline />}</span>
                    </button>
                    <span>{level()}</span>
                    <span>{fmt(props.game.characterStatOf(character, "clickPower"))}</span>
                    <span>{fmt(props.game.characterStatOf(character, "teamDps"))}</span>
                    <span
                      class="synergy"
                      classList={{ bad: props.game.synergyOf(character) < 1 }}
                    >
                      {props.game.synergyOf(character).toFixed(2)}
                    </span>
                  </div>
                  <div class="bar xp-bar" title={`${fmt(progress().into)} / ${fmt(progress().need)} xp`}>
                    <div class="bar-fill" style={{ width: `${pct(progress().into, progress().need)}%` }} />
                  </div>
                  <Show when={character.passive}>
                    <div class="passive-row">
                      <small
                        classList={{ muted: !passive().maxed, capped: passive().maxed }}
                        title={
                          passive().rank > 0
                            ? `Passif de ${character.name} : ${describeModifier({ ...character.passive!, value: character.passive!.value * passiveGrowth(passive().rank) })} — sur ses propres stats.`
                            : "Passif verrouillé : achetez un rang pour l'activer."
                        }
                      >
                        Passif {passive().rank}/{props.game.passiveCapOf(character)}
                        <Show when={passive().rank > 0}>
                          {" · "}
                          {describeModifier({
                            ...character.passive!,
                            value: character.passive!.value * passiveGrowth(passive().rank),
                          })}
                        </Show>
                      </small>
                      {/* Only once "Intendance" is bought: a slot the tree hasn't opened is noise. */}
                      <Show when={props.game.autoRankCapacity() > 0 && !passive().maxed}>
                        <button
                          class="auto-rank"
                          classList={{ on: props.game.isAutoRanked(character.id) }}
                          aria-pressed={props.game.isAutoRanked(character.id)}
                          title={
                            props.game.isAutoRanked(character.id)
                              ? "Passif confié à l'intendance — cliquez pour le reprendre en main."
                              : `Confier ce passif à l'intendance (${props.game.autoRankCharacterIds().length}/${props.game.autoRankCapacity()} places).`
                          }
                          onClick={() => props.game.toggleAutoRank(character.id)}
                        >
                          <IconGear />
                        </button>
                      </Show>
                      <Show
                        when={!passive().maxed}
                        fallback={
                          <small class="capped">max</small>
                        }
                      >
                        <button
                          class="rank-up"
                          disabled={!passive().affordable}
                          title={`${passiveItem()?.name ?? "—"} : ${fmt(passive().copies)} en poche`}
                          onClick={() => props.game.rankUpPassive(character)}
                        >
                          +1 · {fmt(passive().copies)}/{fmt(passive().cost)} {passiveItem()?.name ?? "—"}
                        </button>
                      </Show>
                    </div>
                  </Show>
                  <div class="equip-row">
                    <small class="muted">{props.game.equippedItemOf(character)?.name ?? "Pas d'objet"}</small>
                    <select
                      class="equip-select"
                      value={props.game.characterEquipment()[character.id] ?? ""}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        if (value) props.game.equipItem(character.id, value);
                        else props.game.unequipItem(character.id);
                      }}
                    >
                      <option value="">— Équiper —</option>
                      <For each={equippableUniques(character)}>
                        {(item) => <option value={item.id}>{item.name}</option>}
                      </For>
                    </select>
                  </div>
                </div>
              );
            }}
          </For>
          <Show when={props.game.ownedCharacters().length === 0}>
            <p class="muted pad">Les personnages rejoignent l'équipe quand vous les battez.</p>
          </Show>
        </div>
        </Show>
      </section>

      <Show when={props.game.arcRecruits().length > 0}>
        <section class="panel">
          <header class="panel-head">
            <PanelTitle open={recruitsOpen()} onToggle={() => setRecruitsOpen(!recruitsOpen())}>
              À battre ici
            </PanelTitle>
            <small class="muted">{props.game.arcRecruits().length}</small>
          </header>
          <Show when={recruitsOpen()}>
          <For each={props.game.arcRecruits()}>
            {(character) => (
              <div class="row">
                <span class="name">
                  <Sprite name={character.name} kind="character" anime={animeNameOf(character.animeId)} px={5} />
                  {character.name}
                  <span class="rarity">{character.rarity === "main" ? <IconStar /> : <IconStarOutline />}</span>
                </span>
                <small class="muted">
                  {fmt(character.baseClickPower)} / {fmt(character.baseDps)}
                </small>
              </div>
            )}
          </For>
          </Show>
        </section>
      </Show>

      <section ref={itemsPanel} class="panel roster-resizable-panel" classList={{ collapsed: !itemsOpen() }}>
        <header class="panel-head">
          <PanelTitle onToggle={() => { itemsPanel?.style.removeProperty("height"); setItemsOpen(!itemsOpen()); }} open={itemsOpen()}>
            Objets ({shownItems().length}
            <Show when={itemKindFilter()}>/{props.game.foundItems().length}</Show>)
          </PanelTitle>
          <select
            value={itemKindFilter()}
            title="Filtrer par type"
            onChange={(e) => {
              setItemKindFilter(e.currentTarget.value);
              persistView();
            }}
          >
            <option value="">Tous</option>
            <option value="unique">Uniques</option>
            <option value="common">Communs</option>
          </select>
          <select
            value={itemSortKey()}
            title="Trier les objets"
            onChange={(e) => {
              setItemSortKey(e.currentTarget.value as ItemSortKey);
              persistView();
            }}
          >
            <For each={Object.entries(ITEM_SORTS)}>{([key, sort]) => <option value={key}>{sort.label}</option>}</For>
          </select>
        </header>
        <Show when={itemsOpen()}>
        <div class="table-head item-grid">
          <span>Nom</span>
          <span>Type</span>
          <span>Qté</span>
          <span>Effet</span>
        </div>
        <div class="scroll">
          <For each={shownItems()}>
            {(item) => (
              <div class="item-grid item-row" title={describeItem(item)}>
                <span class="name">
                  <ItemIcon id={item.id} kind={item.kind} /> {item.name}
                </span>
                <span classList={{ unique: item.kind === "unique" }}>
                  {item.kind === "unique" ? "unique" : "commun"}
                </span>
                <span>{props.game.countOf(item.id)}</span>
                <span class="muted">
                  {item.kind !== "unique"
                    ? "passifs"
                    : props.game.wearerOf(item.id)
                      ? `équipé : ${props.game.wearerOf(item.id)!.name}`
                      : "équipable"}
                </span>
              </div>
            )}
          </For>
          <Show when={shownItems().length === 0}>
            <p class="muted pad">
              <Show
                when={props.game.foundItems().length === 0}
                fallback="Aucun objet de ce type pour l'instant."
              >
                Aucun objet trouvé. Les communs d'un arc font monter les passifs des personnages rencontrés là-bas ;
                les uniques des boss s'équipent sur les personnages de l'équipe.
              </Show>
            </p>
          </Show>
        </div>
        </Show>
      </section>
    </div>
  );
}
