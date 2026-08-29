# Combat

The fight itself: who shows up next, how damage lands, and why the kill rate is capped.
See `CLAUDE.md` for the invariants that outrank anything here.

## The combat loop

An arc is a zone the player fights through. `combat.ts` is pure and decides who shows up next:
cycle `arc.mobs` in order until `mobsToBoss` kills, then `arc.boss`; once the arc is cleared, its boss
returns after every 50 ordinary victories, forever. The arc kill counter resets on each boss win and
the combat panel shows progress toward the next encounter. Mobs carrying a `characterId` are the anime's
characters — beating one adds them to the team for free, and they drop out of the pool afterwards.
Enemies carrying an `itemId` may hand it over — see the narrator's click below.

**The kill rate is capped, and that is a balance decision.** Overkill (below) makes the kill rate
`dps / mob hp`, and a cleared arc's mobs never grow while the team's damage does — so going back to
farm an old zone, which the passive-item design explicitly asks for, resolved hundreds of fights a
second. Every per-kill reward rides on that rate: item drops, currency, xp, pack points. Rather than
capping each of them, `MAX_KILLS_PER_SECOND` (5) caps the thing they all derive from, spent from a
`killBudget` the tick refills and never lets bank above the cap. Surplus overkill past the budget is
discarded. It never touches a boss (one enemy, one kill) and never bites during normal progress, only
when the team outguns a zone by more than ~5x. `MAX_KILLS_PER_HIT` stays what it was: a loop safety
net against a data mistake, not a knob.

**The budget is spent strictly, and that took a fix.** `dealDamage` used to resolve at least one kill
whatever the budget held, on the theory that a fight could otherwise stall at 0 hp waiting for the
refill. But the tick, the autoclicker and *every single manual click* are separate calls to it, so
each collected that free kill: the measured rate was `MAX_KILLS_PER_SECOND` **plus the click rate** —
20 kills/s at 20 clicks/s, four times the cap, with every per-kill reward riding along — and the
budget went unboundedly negative with nothing flooring the debt, so after a few minutes of clicking
the overkill burst never fired again. Spending no more than the budget holds fixes both at once. The
stall is handled by construction instead: what the budget caps is *kills*, not damage, so leftover
damage still chips the enemy in front of the team. It can leave one on nothing for a fraction of a
second — the budget refills a kill every tick — and the next call fells it. `src/engine/tests/` guards
this with a 40-clicks/s run that must stay inside the cap.

**And the player can now see it bite.** The cap used to be entirely invisible: the stage printed
"DPS équipe" and nothing else, so on an arc the team had outgrown by 20x the honest reading of that
number was "95% of this does nothing here" — while every screen in the game kept inviting the player
to grow it. `killRateOf(hp, dps, cap)` (pure, in `combat.ts`) turns the three into the cadence the
fight actually resolves at, and how much of the damage the cap is discarding; `gameState`'s
`killRate` memo feeds it the current enemy's **full** hp — the pool's price, not how far along this
one fight is — and the stage prints one line under the stat grid: `Cadence 2.3 / 5 ennemis/s`,
turning gold with `— plafond atteint, 93% du DPS perdu ici` once the surplus starts being thrown
away. It is a readout and nothing more: no rule reads it, and the cap behaves exactly as before.

Two deliberate limits on that line. It is measured on `teamDps` alone, so it stays the same number
the tile above it prints — clicks fell enemies too and spend the very same budget, so the true
cadence sits a little above it while the player is clicking, but a rate that moved with how fast a
hand is moving would say nothing about the *arc*, which is the question being answered. And it is
absent on a boss: one enemy means one kill, so the cap has nothing to bite on there and a "DPS
perdu" figure would be a lie — the boss's reading is its time-to-kill against its own clock, which
the hp bar already gives.

Enemies never deal damage. The only pressure is `Enemy.timerMs`: run out and the enemy respawns at
full hp, nothing else. It sits on `Enemy`, not on a boss-only type, so making mobs timed is a data
change — by default only bosses carry one, because timed mobs would break idling.

Damage has two sources, both modifier-driven: `clickPower` (one narrator click, based on
`narratorClickPower`) and `teamDps` (applied every tick as `dps * delta`). **Overkill carries over
to the next enemy**: `dealDamage` loops, spending the leftover on the replacement `spawnNext` puts
up. Without it a single hit could only ever land one kill, capping progress at 5 fights/second
whatever the dps — which the design's "come back and farm this arc's common" loop cannot afford late
in a run. `MAX_KILLS_PER_HIT` bounds that loop: a safety net against a data mistake, not a balance
knob. Currency only ever comes from kills — there is no passive
income any more, and `lifetimeEarned` is what feeds prestige.

`timeToKillMs(hp, dps)` is the one number that says whether a fight is going anywhere; the store
exposes it for the current enemy (`timeToKill`, printed on the hp bar) and, per arc, as
`bossOutlookOf` — the boss's hp at that world's frozen difficulty against the dps the team would
deal **there**, not here (synergy makes those very different), measured against the boss's own
`timerMs` with the tree's boost applied exactly as `spawnNext` applies it. That comparison is what
`ProgressPanel` turns into the "trop dur" marker, since the boss clock is the only thing in the game
that can actually stop a run.

That dps goes through the **whole modifier pipeline** — `permanentModifiersFor(arc)` rebuilds every
permanent contribution as if that arc were the one being fought, and `computeScopedStat` folds it
exactly as `teamDps` does. It used to sum the characters' `flat` damage by hand instead, which
quietly left out passives, evolution bonuses, equipped uniques, achievements and the prestige tree —
most of a grown team's dps — so the marker cried "trop dur" on bosses the team could fell several
times over. The fix then overshot the other way: it folded with `computeEffectiveStat`, which is
**scope-blind**, so every character's own passive percent applied to the *whole* team's flat damage
and a 40-strong roster was credited with an order of magnitude more dps than it brings. `teamDps`'s
own fold is the only honest answer, so the marker uses it. Running buffs are the one thing
deliberately excluded: an ability lasts seconds, and the marker answers "come back later?", not
"fire now?" — it must not blink on and off with a cooldown.

Combat state (current enemy, hp left, timer deadline) is deliberately **not** saved: a reload
restarts the current fight. Only kill counts and cleared arcs persist.

## How steep a world's hp table has to be

A world's arcs are generated from a table that ramps every number by a fixed factor per arc. The
factor is not free: **it has to match the rate the team's own dps ramps**, or the world's pace drifts
one way or the other for the whole of its length, compounding.

`npm run sim --json` measures that rate, and it is much steeper than it looks. Both generated worlds
now grow the team's dps by a geometric mean of **2.12x per arc** (it was 2.53x before `CATCH_UP` rose
to 0.85, which flattened the curve by lifting the whole roster instead of the last few recruits) —
recruits whose own stats ramp, their passives stacking additively as the roster deepens, levels,
duplicates, achievements and the tree, all multiplying together. Shippūden's table originally ramped everything by 1.85x, tuned when the
roster was small. The gap of 1.37x per arc compounded over fifteen arcs: the first arcs took ~3
minutes and the last ones **0.3** — bottomed out on `MAX_KILLS_PER_SECOND`, not on enemy hp at all.
The climax was the fastest part of the game, and the boss clock — the only thing that can stop a run
— had stopped mattering: the margin between a boss's time-to-kill and its own timer drifted from
**0.8x on the first arc to 134x on the last**. Bosses after arc 6 were a formality.

Both generated worlds are now tuned on three ramps rather than one, all verified with the simulator:

| What | Shippūden | Boruto | Why |
|---|---|---|---|
| Boss `baseHp` | **2.37x** | **2.39x** | Just above the dps ramp, so the boss keeps the same pressure at every arc |
| Mob `baseHp` | **2.21x** | **2.25x** | Under the boss ramp, so the grind rises gently instead of turning the climax into a slog |
| `reward`, recruit stats | 1.85x | 1.85x | **Untouched, in every world** — currency comes from kills, and kills per arc are fixed by `mobsToBoss`, so an hp-only change moves the clock without touching the economy at all |

**The two worlds now sit on the same ramps**, where Boruto used to need the steeper table. That is
`CATCH_UP` (`docs/progression.md`): once the whole roster rides the story's ramp instead of only the
last few recruits, how fast the team's dps grows stops depending on how deep the roster is — so it
stops depending on which world you are standing in. A fourth world can start from these numbers
rather than measuring a third pair from scratch; the arc-0 allowance below still has to be measured.

**These four ramps have been refit whole twice**: when `CATCH_UP` went 0.75 → 0.85
(`docs/progression.md`), which handed the team ~1.58x more dps, and again when
`SCOPED_BUFF_CAP` became a ramp (`docs/modifiers.md`), which took ~1.2x of it back and took it back
*unevenly* — hardest on the early arcs, not at all on the last three. That second refit is why the
tables are steeper than the dps ramp: the ability nerf is front-loaded, so the hp cut had to be too. The loop below converged in five passes, and the pacing it converged
*to* was deliberately not the old per-arc table: the old one had spikes (Shippūden's "L'Assaut de
Pain" fell in 0.44 min, "Confrontation" took 3.66) that were artifacts of a recruit landing at the
right arc — exactly the unevenness a higher `CATCH_UP` removes. The target is the log-linear fit
through the old curve, rescaled to preserve each world's **total** minutes. Reproducing the old
spikes would have meant re-introducing them by hand into the hp table.

Boss timers are fit last, from the `avgDps` the `--json` report carries per arc, at a margin of
**~1.5x** over the worst time-to-kill across seeds 1, 2, 3 and 7 — rounded up to 15s steps, kept
non-decreasing across a world, and floored at 45s so the opening arcs stay forgiving. The result, at
4 clicks/s: **28/28 arcs cleared in 84-87 minutes with no boss timeout anywhere**, every arc's margin
landing between 1.5x and 5.3x, Shippūden rising 1.5 → 3.9 minutes an arc and Boruto 3.6 → 7.6, and
the same 3.21T earned and the same 256 prestige points banked at every seed — the proof the economy
is untouched by a change that moves hp, the clock, `baseDps` or the buff cap alone.

**Why 1.5x, where this table used to carry 2.5x.** The margin is what makes "Siège prolongé" — the
"DPS Équipe" tree's node 5, `BOSS_TIMER_BOOST` = +30% of the base clock per level — worth a point.
At 2.5x the base clock already felled every boss with time to spare, so the node bought nothing: at
5/5 a fight ran 6.25x its own time-to-kill, and the only real wall in the game had stopped being
one. At 1.5x the bare run is tight, 2/5 restores roughly the old comfort (~2.4x) and 5/5 is
genuinely safe (~3.8x) — the node now buys the margin instead of the base clock handing it over.
**The node itself was not touched**; the base timers were. Two things keep that from being harsh:
the simulator measures a *first* run, which has no tree at all, so 1.5x is the floor case and every
later run walks in with more dps than this; and `avgDps` is the mean over a whole arc while the boss
is fought at its end, so the margin a player actually feels is wider than the number here. A timeout
is soft anyway — the boss respawns, the team keeps farming levels, items and passives until it
falls.

Two things the retune fixed, both of which had drifted since the tables were last measured:

- **The run did not finish.** Before `CATCH_UP`, the simulator walled in Shippūden ("L'Histoire
  d'Itachi") and never reached Boruto — so Boruto's table had gone unverified for a while.
- **The back half was cap-bound, not hp-bound.** Boruto's arcs were falling in 0.2-1.3 minutes,
  bottomed out on `MAX_KILLS_PER_SECOND` rather than on enemy hp — the same failure mode Shippūden's
  flat 1.85 table had, one world further along.

Retuning is a closed loop, not an equation: run `npm run sim`, take each arc's minutes against its
target, fold the ratios into one `base x ramp^arc` fit per world (never per arc — `data.test.ts`
holds the tables geometric), apply, repeat. It converges in about five passes. Fit the boss timers
last, from the `avgDps` the JSON report carries per arc.

Three practical notes, each learned by getting it wrong:

- **Refit the boss timers mid-loop, not only at the end.** A boss that times out re-farms its whole
  arc, which lands in that arc's minutes as a 2x outlier and poisons the fit for every pass after.
  When one arc times out on all four seeds, fix the clock before reading the ramps again.
- **Naruto part 1 is corrected arc by arc, and damped.** It is hand-written, so `data.test.ts` does
  not hold it geometric — but its arcs respond *superlinearly* to hp (roughly time ∝ hp^1.45),
  because the team is still forming and a longer arc also means more recruits and levels. Applying
  the raw ratio makes it oscillate with growing amplitude; `ratio ** 0.7` converges in two passes.
- **Hunter x Hunter follows the same opening-world method.** It is an independent entry point, not
  a late-game continuation, so its six arcs are hand-authored against a fresh team and deliberately
  stay outside the geometric sequel-table test. Its 30 recruits made the first table collapse in
  under ten minutes: kill budgets now rise from 20 to 52, enemy hp is roughly twice the original
  curve, and recruit damage after the opening arc is roughly halved. Every boss now uses the same
  strict 60-second timer. Seeds 1–4 clear the world in 33.6–33.8 minutes and each records three
  timeouts followed by successful rematches: abilities remain valuable, while the clock creates
  pressure without becoming a wall.
- **Bleach is the same method again, over fifteen arcs — and it is where the loop was actually run
  end to end.** Also an entry point, also outside the geometric test, but long enough that a single
  ramp does not fit it: the opening is a cliff (mob hp ×55, then ×4.1, ×2.6, ×2.0 over the first
  four arcs, because a team goes from four members to thirty-three in that stretch) and only then
  does it settle. From arc 4 on the table is close to geometric at **~1.6x an arc for mob hp**,
  which is the measured team-dps ramp (**~1.45x**) times the 1.10x an arc the *target* clock grows
  by. Note how far below the sequel worlds' 2.12x that dps ramp is: Bleach's printed `baseDps`
  climbs only 1.24x an arc (`src/data/bleach/index.ts` says why), so nearly all of its dps growth
  comes from the roster deepening — 111 recruits — rather than from recruits being individually
  stronger. **Boss hp was then fit last from `avgDps`, per arc, at `avgDps × timer / 1.5`**, which
  is the whole reason the margins hold flat: a constant boss-to-mob hp ratio would have let them
  drift by that same 1.10x an arc — 3.7x across the world. Clocks are 60s for arcs 0–7, 75s for 8–11 and 90s
  for 12–14. Result at 4 clicks/s: **15/15 arcs in 39.8–40.0 minutes on seeds 1, 2, 3 and 7, with
  no boss timeout anywhere**, every arc within 4–6% of its target, and arcs rising 1.15 → 4.87
  minutes.
- **The loop really does take five passes, and the boss fights are ~20% of an arc.** Measuring
  Bleach's mob table with the bosses left in place kept poisoning the fit — a boss that cannot fall
  re-farms its arc, and even one that can adds its own time to the arc's minutes. Both were solved
  by measuring in two stages: a *probe* run with deliberately harmless bosses (hp = 8× the arc's mob
  hp, ten-minute clocks) to read `avgDps` and the mob table's pacing alone, then the real bosses
  fitted on top and one final correction pass for the ~19% uniform stretch they add.
- **Active ability damage uses the same ceiling in every world.** Character and evolution
  abilities are capped at ×3.5 for multipliers and +50% for additive damage bonuses; lower tiers
  are reduced too rather than only clipping the peak. After applying this to Naruto, Shippuden, and
  Boruto, seeds 1–4 still clear all 34 arcs in 121.7–122.3 minutes without stalling.
- **Update `data.test.ts`'s expected ramps in the same commit.** They are measurements, not targets,
  and a corrective ramp of even 1.5%/arc compounds them past the test's ±0.05 tolerance.

### Where a new world's arc 0 starts — not where you would think

**Adding a world means measuring this again, not copying a ramp.** The dps ramp is a property of how
deep the roster is by then, so a fourth world's table starts from what the simulator reports at the
end of the third — not from `difficultyMultiplier`, whose 2.5x per *tier* is nothing next to a
world's own internal ramp.

But the number to measure is **not the dps the team ends the previous world with.** Boruto's table
was first sized against Shippūden's closing 61.8B dps, and the world walled on its very first boss.
Crossing into a new world does two things at once to a team built over sixty recruits:
`synergyMultiplier` drops every one of them to `otherAnimeMalus` (half damage), and
`characterContributions` **shuts their passives off entirely** — and by then those additive percents
are most of what the team's dps is. Their active abilities go with them (`getUnlockedAbilities`),
which deepens the cliff again. Measured at the time, the crossing cost 61.8B → **1.95B, a 32x
cliff**, and it gets steeper with every world added because the roster carried across keeps growing.
**Those two figures predate `CATCH_UP` 0.85 and the `baseDps` cohort floor — re-measure the cliff
before sizing a fourth world on it.** The mechanism is what matters here and is unchanged; the
magnitude is not, since both changes altered how much of a team's dps comes from characters whose
passives the crossing switches off.

So a world's arc 0 is sized against the dps the team has **once it is standing there**, which is far
below where the previous world left off. The cliff closes fast — Boruto's own recruits bring their
passives home, and its arc 1 is already back to 15B — so only arc 0 needs the allowance; the ramp
takes over from there. The same shape is why both worlds open with an arc noticeably easier than the
finale before it: crossing a world border is a breather by construction, not by accident.

## The narrator's click

`click()` returns `{ damage, crit }`, not a bare number — the stage has no other way to tell the
player a click landed for `CRIT_MULTIPLIER` times its usual damage (`.pop.crit`). The stage is also
keyboard-operable (`role="button"`, space/enter): the click is the game's core verb, so it can't be
mouse-only.

`narratorClickPower(allyCount)` is the *base* fed into the `clickPower` pipeline: it rises with the
number of allies in the team and with nothing else. The click is a **trigger, not a damage source** —
it is there to fire abilities; the team's `teamDps` is what kills things. Keep it that way when
tuning: character stats lean on `baseDps`, and abilities buff `teamDps`.
