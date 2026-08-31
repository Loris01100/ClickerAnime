# Anonymous progression telemetry

Telemetry is explicit opt-in. Until the player presses **Autoriser**, the client sends nothing.
The preference, already-sent milestone names and one accumulated active-play stopwatch live
locally; no player, device, installation or session id is generated or transmitted. The stopwatch
is stored before consent only on-device; nothing leaves the browser until consent. It adds at most
one second per visible game tick, so a closed, sleeping or hidden tab cannot turn a ten-minute wall
into a three-day milestone. The transmitted duration is rounded to a half-minute bucket rather than
sent as a high-precision behavioral trace. A menu switch makes opposition as easy as acceptance.

The client sends same-origin JSON to `/api/telemetry`. `worker.ts` accepts only the two documented
event shapes, rejects unknown fields (including any accidental `playerId`), caps body size, checks
the `Origin`, and writes the aggregate dimensions to Workers Analytics Engine. It never writes the
request IP or user agent into the dataset.

`clickeranime_progression` columns are:

| Column | Meaning |
|---|---|
| `index1` / `blob1` | event: `progression` or `prestige` |
| `blob2` | milestone name, or `completed` |
| `blob3` | current anime id, when applicable |
| `blob4` | current arc id, when applicable |
| `blob5` | telemetry schema (`v1`) |
| `blob6` | hostname, to separate production from preview URLs |
| `double1` | current milestone value, or prestige gained |
| `double2` | run completion on prestige (0..1) |
| `double3` | accumulated active-play minutes for a progression milestone, or run duration on prestige |

The dataset is created automatically on its first production write, and Cloudflare keeps Analytics
Engine data for three months. Query it through Cloudflare's Workers Analytics Engine SQL API with
an **Account Analytics: Read** token kept outside the repo.

Production funnel over the last 30 days:

```sql
SELECT
  blob2 AS milestone,
  SUM(_sample_interval) AS events
FROM clickeranime_progression
WHERE blob1 = 'progression'
  AND blob6 = 'clickeranime.reesch.com'
  AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY milestone
ORDER BY events DESC
```

Average time to each first milestone over the last 30 days:

```sql
SELECT
  blob2 AS milestone,
  SUM(_sample_interval) AS events,
  SUM(_sample_interval * double3) / SUM(_sample_interval) AS average_minutes
FROM clickeranime_progression
WHERE blob1 = 'progression'
  AND blob6 = 'clickeranime.reesch.com'
  AND double3 > 0
  AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY milestone
ORDER BY average_minutes ASC
```

Milestones sent by builds from before elapsed-time measurement carry `double3 = 0`; exclude those
rows when comparing pacing during the rollout. A player who had already sent a milestone never
sends it again, so the change creates no duplicate event and only newly reached milestones gain a
duration.

Prestige pacing over the last 30 days:

```sql
SELECT
  SUM(_sample_interval) AS prestiges,
  SUM(_sample_interval * double1) / SUM(_sample_interval) AS average_points,
  SUM(_sample_interval * double2) / SUM(_sample_interval) AS average_completion,
  SUM(_sample_interval * double3) / SUM(_sample_interval) AS average_minutes
FROM clickeranime_progression
WHERE blob1 = 'prestige'
  AND blob6 = 'clickeranime.reesch.com'
  AND timestamp > NOW() - INTERVAL '30' DAY
```

The consent banner states the purpose, excluded data, three-month retention and where to withdraw
consent. A future policy/privacy page should repeat those facts before production promotion. Even a
consented, deliberately minimal audience-measurement system remains a data-processing activity;
anonymous product wording is not a substitute for that disclosure.
