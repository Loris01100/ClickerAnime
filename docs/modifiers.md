# Modifiers and abilities

The one pipeline every stat change goes through, and the abilities that feed it temporaries.

## The modifier pipeline

Everything that affects a stat becomes an `ActiveModifier`, and `computeEffectiveStat` folds them:
`(base + flats) * (1 + Σpercents) * Πmultipliers`. That order is a balance decision — changing it
rebalances the whole game.

**A buff is scoped to the character it comes from.** An `ActiveModifier` may carry a `scope`: the
id of the one character it applies to. A character's own base damage is scoped to them, and so is
every ability buff — a character's ability lands on that character, never on the rest of the team. `computeScopedStat` folds each scoped group on its own through the usual
pipeline (with the team-wide *scaling* applied to it as well, and the team-wide flats counted once,
outside), which is exactly `computeEffectiveStat` while no buff is running, since a percent over a
sum of flats is the same as that percent over each flat.

That scoping is what lets **every ability run at once**, which is the point: nothing blocks
anything, two buffs on the same character stack on them, and re-firing an ability refreshes its own
buff instead of adding a second copy. The old rule was one buff per stat —
`replaceModifiersByTarget` plus a same-stat lock on the bar — because a team-wide buff firing
alongside another stacked into far too much damage. Scoping bounds it structurally instead: a buff
can never be worth more than the share of the team it names. Two earlier attempts stay rejected:
a `STACK_FALLOFF` on overlapping team-wide temporaries (still far too much damage), and going back
to team-wide buffs at all.

Being worth a share of the team also makes the printed value worth far less than it used to be, so a
percent or multiplier effect is scaled twice before it lands (flats never are — a flat bump lands
whole on its character either way, and so does the tree's node 2):

- `scopedMagnitude(owned, covered)` — the roster over the part of it any ability reaches. ~1 on a
  grown roster where nearly everyone carries an ability; early, where three characters out of
  fifteen have one, it hands back the climb a single team-wide buff used to carry.
- `dutyMagnitude(ability)` — `cooldownMs / durationMs`, sur la recharge **imprimée**. Up an eighth of the time, it hits eight times
  as hard while it lasts; without it a buff on two allies for six seconds is noise.

`ABILITY_COOLDOWN_SCALE` (1.5) étire toute recharge avant que le store ne teste la disponibilité —
et **n'entre pas** dans `dutyMagnitude`, sinon l'attente rallongée rendrait chaque activation
proportionnellement plus forte et le dps moyen ne bougerait pas : le nerf serait un simple
regroupement en pics. C'est bien de l'uptime en moins (`npm run sim` : 76 → 95 min pour les mêmes
17 arcs).

**`SCOPED_BUFF_CAP` (50) is the ceiling those two are allowed to reach**, applied per character in
`computeScopedStat`: whatever lands on one character can never lift their own damage past 50x. It is
not decoration — the first cut shipped without it and a grown save hit ~4.5 Qa against 3T-hp enemies,
because stacked multiplier buffs on the same character multiply, compensation included. Stacking buys you *reaching* the ceiling faster and on more allies, never
passing it.

### The ceiling is a ramp, not a number

That ceiling **is** an ability's strength, for almost the whole game. Measured with `npm run sim`:
switch the cap off and the run drops from 80 to 32 minutes, and the per-arc ratios show it binding
from **arc 2 onward and never letting go**. So from the third fight of a fresh run, a buffed
character dealt exactly `bare * 50` whatever the buff printed — an opening ability and an Ôtsutsuki
ability were worth the same thing, and the whole ladder the ability data describes was invisible.

So the cap climbs with the run: `scopedBuffCap(progress)` interpolates geometrically from
**`SCOPED_BUFF_CAP_FLOOR` (12)** on the first arc to the full 50 on the last, `progress` being
cleared arcs over `arcs.length - 1` (the store's `buffCap` memo — the ceiling should be reached *on*
the final arc, not one clear after the game ends). Two things fall out of it:

- **Abilities are weaker early and grow through the run**, which is the point. Under the floor the
  cap stops binding at all, so `computeEffectiveStat` decides again and the printed values on the
  early abilities go back to meaning something different from each other.
- **The ceiling itself never moves.** 50 is what stops the runaway above; raising it re-opens exactly
  that. The ramp only ever lowers the early game — `src/engine/tests/` guards that no `progress`,
  including a `NaN` one, can put the cap outside `[floor, 50]`, and that it climbs monotonically so
  clearing an arc can never weaken a buff.

Because the cap is the strength knob, moving the floor **rebalances the whole first two thirds of the
game**: both generated hp tables were refit against 12 (three passes, `docs/combat.md`). The store
prints the live value in the "Capacités" header ("Maîtrise x12") and in every ability's tooltip —
an invisible ramp would just read as abilities being randomly weak early.

Re-measured with `npm run sim` after every change to any of these: a full run lands at 84-87 min,
and the endgame dps within a few times the old one-buff rule instead of two hundred.

A `ModifierTemplate` is just `target`/`kind`/`value` — it carries **no id
of its own**: nothing in the pipeline keys off one (`computeEffectiveStat` keys on
`target`, `computeScopedStat` on `scope`), and `ActiveModifier.sourceId` is what names where a
modifier came from. Don't reintroduce a per-effect `id` in the data files. Modifiers come from three
sources, merged in `allModifiers`:

1. **Owned characters** → `characterContributions` converts base stats + innate passive + any
   equipped unique item (`Item.effects`) into modifiers, each pre-scaled by the character's synergy
   with the active arc. Base stats **and the passive** carry the character's id as their `scope`: a
   passive raises its own character's statistics, not the team's.
2. **Activated abilities** → temporary modifiers stamped with `expiresAt` and one `scope` per
   character the ability covers, pruned on every tick.
3. **Equipped unique items** → permanent modifiers contributed by `characterContributions`, carrying
   the wearer's id as their `scope`: a unique buffs the character wearing it and nobody else, the
   same rule as an ability's buff. The equipment mapping lives in `gameState` (`equipItem`,
   `unequipItem`, `equippedItemOf`).

Expiry is checked both in `pruneExpired` and again inside `computeEffectiveStat`, so a stale list
can never inflate a stat.

### Weakening an effect: a multiplier is neutral at 1, not 0

Everything a character contributes is pre-scaled — by the synergy tier, and for a passive by its
rank growth on top. `scaledEffect` (synergy.ts) does that scaling, and it **must not touch a
`multiplier`'s value directly**: only the part above 1 is scaled, `1 + (value - 1) * scale`. A
`flat` and a `percent` are neutral at 0, so scaling their value is a weakening; a multiplier is
neutral at 1, so scaling *its* value is a sign flip.

Getting that wrong is not a rounding issue, it inverts the effect. An equipped unique printed x1.35
came out `1.35 * 0.5 = x0.675` at the `otherAnimeMalus` tier: the character dealt a third **less**
damage than with the slot empty, so the correct play was to unequip before travelling. It bit every
one of Bleach's fourteen uniques, all of them multipliers, and it compounded with the forge — a
rank-1 Pantera (x1.175) landed at x0.5875.

`scaledUniqueEffect` (forge.ts) already had the rule right for the forge ranks; `scaledEffect` is
the same formula applied to the other scaling axis. It covers all three carriers — the passive, the
evolution bonus and the equipped unique — even though today's data only writes multipliers on the
last one, because `ModifierTemplate` allows one anywhere and the first authored multiplier passive
would otherwise arrive as a team-wide nerf. Guarded in `src/engine/tests/modifiers.test.ts`.

**What the roster prints per character is that character's own term in `computeScopedStat`**, not a
fold of their modifiers alone. `characterStatOf` pulls their scoped group out of `allModifiers` and
re-folds it with the team-wide scaling — achievements, the prestige tree, challenge rewards, every
evolution bonus — because that is exactly what `teamDps` does to it. Folding the group on its own
was the older, wrong answer: the team-wide scaling is most of a grown team's damage, so a 40-strong
roster averaging 3k dps a row sat under a 240k team total with no ability running, and the column
looked broken. The two numbers now agree by construction — `Σ characterStatOf(c, "teamDps")` **is**
`teamDps()`, guarded in `src/engine/tests/store.test.ts` — and `clickPower` differs only by the
narrator's own base, which belongs to no character. It reads the memo rather than rebuilding a
character's contributions by hand because the roster asks for it once a row, twice, every tick.

That column folds against `statClock`, not `now`. Reading the 200ms clock had every roster row
refold twice a second for five — a real cost on a fifty-strong team, for a number nobody watches at
that resolution. `statClock` advances on the tick that prunes an expired buff, and otherwise once a
second; it is never ahead of `now`, and the prune guarantees no live modifier expires between the
two, so the equality above still holds exactly rather than approximately.

### What is allowed to invalidate the roster fold

`permanentModifiers` is the expensive memo of the whole game — the entire roster back through
`characterContributions` — and `bossOutlookOf` runs the same fold again, once per arc the progress
panel has on screen. So what it *depends on* is a performance decision, and two of those
dependencies used to be signals that change on literally every kill:

- **The synergy config.** `activeSynergyConfig` reads `now()` (through `crossoverActive`), and
  `softenedSynergyConfig` builds a fresh object at any level above 0 — so once "DPS Équipe" node 3
  was bought it handed back a new reference five times a second, and Solid keys a memo on reference.
  It is now three memos: `softenedConfig` (node level only), `crossoverConfig`, and the ternary
  between them. The ternary still re-runs each tick; it just returns an object Solid already knows.
- **Levels and achievement counts.** `grantXp` rewrites `characterXp` and `defeat` bumps
  `achievementCounts` on every single kill, but a *level* moves a few dozen times in a whole run and
  an achievement *tier* less often than that. `levelsByCharacter` and `achievementModifiers` are
  memos with a value-based `equals`, which turns "the xp changed" back into "a level changed".

Measured on a 21-strong roster with five arcs on screen, mid-run: 1260 rebuilds of a character's
contributions over ten idle ticks before (1470 with node 3 bought), **0** after. Any new dependency
added to `permanentModifiersFor` has to be held to the same test — if it changes per kill, it needs
a value-equal memo in front of it.

## Abilities

Unlocked by owning a character that grants one, computed from the owned set in
`getUnlockedAbilities`. `UnlockedAbility` carries `characterIds` — who the buff lands on, which is
that character alone.

**And only at home.** The same home-arc rule still controls firing and automation, but the roster no
longer makes the rejected ability disappear. `diagnoseAbility` classifies every owned ability as
ready, active, cooling down, blocked by the current anime, or blocked by a challenge. For an anime
block, it returns both the current anime and the complete list where the character is present; the
French UI can therefore name exactly who lost what and where it works again. For a challenge block,
it names the active challenge and its constraint. This diagnosis is explanatory only: the rule is
still enforced at its source, and `allModifiers` filters out any buff still running after travel. A
crossover window does not lift it, since a crossover buys damage and never a story ability.
Cooldowns are tracked as last-used timestamps in a record, not as counters,
and they are now the **only** gate: nothing locks an ability out any more, so the bar's tooltip
names the ally a buff will land on instead of the ability blocking it. The "Clic du Narrateur" free trigger picks any ability that isn't already
running — re-firing one would only refresh a buff the player already has. `readyAbilities` lists
what is off cooldown and `activateReadyAbilities` fires all of it, which is the bar's « Tout lancer »
button: with buffs stacking, firing everything is simply the best play, and doing it by hand across
forty buttons is chores, not a decision. `activeBuffs` lists which abilities are still running, so the bar can mark them; `RosterPanel` sorts
ready-first on a deliberately *binary* key, since sorting by exact cooldown left would reshuffle the
bar under the cursor every tick.
