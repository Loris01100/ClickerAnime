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
capping each of them, `MAX_KILLS_PER_SECOND` (20) caps the thing they all derive from, spent from a
`killBudget` the tick refills and never lets bank above the cap. `dealDamage` always resolves at
least one kill whatever the budget, so a fight can never stall at 0 hp; surplus overkill past the
budget is discarded. It never touches a boss (one enemy, one kill) and never bites during normal
progress, only when the team outguns a zone by more than ~20x. `MAX_KILLS_PER_HIT` stays what it
was: a loop safety net against a data mistake, not a knob.

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

## The narrator's click

`click()` returns `{ damage, crit }`, not a bare number — the stage has no other way to tell the
player a click landed for `CRIT_MULTIPLIER` times its usual damage (`.pop.crit`). The stage is also
keyboard-operable (`role="button"`, space/enter): the click is the game's core verb, so it can't be
mouse-only.

`narratorClickPower(allyCount)` is the *base* fed into the `clickPower` pipeline: it rises with the
number of allies in the team and with nothing else. The click is a **trigger, not a damage source** —
it is there to fire abilities; the team's `teamDps` is what kills things. Keep it that way when
tuning: character stats lean on `baseDps`, and abilities buff `teamDps`.
