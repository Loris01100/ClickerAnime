# Combat

The fight itself: who shows up next, how damage lands, and why the kill rate is capped.
See `CLAUDE.md` for the invariants that outrank anything here.

## The combat loop

An arc is a zone the player fights through. `combat.ts` is pure and decides who shows up next:
cycle `arc.mobs` in order until `mobsToBoss` kills, then `arc.boss`; once the arc is cleared the boss
stops appearing and the zone farms mobs forever. Mobs carrying a `characterId` are the anime's
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
permanent contribution as if that arc were the one being fought, and `computeEffectiveStat` folds it
in the usual order. It used to sum the characters' `flat` damage by hand instead, which quietly left
out passives, evolution bonuses, equipped uniques, achievements and the prestige tree — most of a
grown team's dps — so the marker cried "trop dur" on bosses the team could fell several times over.
Running buffs are the one thing deliberately excluded: an ability lasts seconds, and the marker
answers "come back later?", not "fire now?" — it must not blink on and off with a cooldown.

Combat state (current enemy, hp left, timer deadline) is deliberately **not** saved: a reload
restarts the current fight. Only kill counts and cleared arcs persist.

## How steep a world's hp table has to be

A world's arcs are generated from a table that ramps every number by a fixed factor per arc. The
factor is not free: **it has to match the rate the team's own dps ramps**, or the world's pace drifts
one way or the other for the whole of its length, compounding.

`npm run sim --json` measures that rate, and it is much steeper than it looks. Across Shippūden the
team's dps grows by a geometric mean of **2.53x per arc** — recruits whose own stats ramp, their
passives stacking additively as the roster deepens, levels, duplicates, achievements and the tree,
all multiplying together. Shippūden's table originally ramped everything by 1.85x, tuned when the
roster was small. The gap of 1.37x per arc compounded over fifteen arcs: the first arcs took ~3
minutes and the last ones **0.3** — bottomed out on `MAX_KILLS_PER_SECOND`, not on enemy hp at all.
The climax was the fastest part of the game, and the boss clock — the only thing that can stop a run
— had stopped mattering: the margin between a boss's time-to-kill and its own timer drifted from
**0.8x on the first arc to 134x on the last**. Bosses after arc 6 were a formality.

Both generated worlds are now tuned on three ramps rather than one, all verified with the simulator:

| What | Shippūden | Boruto | Why |
|---|---|---|---|
| Boss `baseHp` | **2.5x** | **2.55x** | Matches the dps ramp, so the boss keeps the same pressure at every arc |
| Mob `baseHp` | **2.33x** | **2.4x** | Slightly under, so the grind rises gently instead of turning the climax into a slog |
| `reward`, recruit stats | 1.85x | 1.85x | **Untouched, in every world** — currency comes from kills, and kills per arc are fixed by `mobsToBoss`, so an hp-only change moves the clock without touching the economy at all |

Boss timers were widened by 1.5x alongside (rounded to 15s steps). The result, on seed 1 at 4
clicks/s: Shippūden's arcs run 1.3 → 3.4 minutes in a gentle rise, every boss fight uses 18-56s of
its timer for a margin of 1.9x to 6.6x, and a full run goes from 27 to ~45 minutes with the same
8.76B earned and the same 236 prestige points banked — the proof the economy really is untouched.
Boruto, the world after it, runs 3.5 → 7.2 minutes per arc for margins of 3.2x to 8.4x. It is the
hardest world by a clear margin, which is what its place in the reading order calls for.

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
are most of what the team's dps is. Measured, the crossing cost 61.8B → **1.95B, a 32x cliff**, and
it gets steeper with every world added because the roster carried across keeps growing.

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
