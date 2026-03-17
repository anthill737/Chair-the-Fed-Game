# Chair the Fed

**Navigate market shocks as the Chair of the U.S. Federal Reserve! Balance inflation and unemployment over 16 quarters — without crippling the economy.**

## Attribution

"[Simulation: Chair the Fed](https://creativecommons.org/licenses/by/4.0/)" by Linda Williams and [Lumen Learning](https://lumenlearning.com) is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes were made to the original material.

Screenshot of Chair the Fed graphic provided by Lumen Learning — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

---

## Play the Game

**[▶ Launch Chair the Fed](https://htmlpreview.github.io/?https://github.com/anthill737/Chair-the-Fed-Game/blob/main/index.html)**

Or clone the repo and open `index.html` locally — no server or build step required.

---

## How the Model Works

The simulation uses a simplified macro model inspired by New Keynesian economics:

- **Inflation** and **unemployment** each update every quarter based on:
  - The current policy stance (rate changes take effect with a lag)
  - Deferred effects from last quarter's decision (lag transmission)
  - The active shock event for that quarter (if any)
  - A small random noise term (±0.15%)
  - Gradual mean-reversion toward targets

- **Policy lag:** Only 45% of a rate change's effect hits this quarter; 55% bleeds into next quarter. This models the real-world delay in monetary policy transmission.

- **Phillips curve direction:** Raising rates reduces inflation pressure but increases unemployment pressure, and vice versa. The effects are not perfectly symmetric or instant.

---

## How Scoring Works

Each quarter, a **penalty** is calculated:

```
penalty = |inflation - 2.0| + |unemployment - 5.0|
```

At the end of 16 quarters, an **average penalty** is computed. Final score (0–100):

```
score = max(0, 100 - (avgPenalty / 5) * 100)
```

| Score | Outcome |
|-------|---------|
| 80–100 | Reappointed with Distinction |
| 60–79  | Reappointed |
| 40–59  | Not Reappointed |
| 0–39   | Removed from Office |

---

## Where to Tune the Economy

All tuning constants are at the top of `app.js`:

| Constant | Purpose |
|----------|---------|
| `TARGET_INFLATION` | Fed's inflation target (default 2.0%) |
| `TARGET_UNEMPLOYMENT` | Natural rate of unemployment (default 5.0%) |
| `INIT_INFLATION` / `INIT_UNEMPLOYMENT` / `INIT_RATE` | Starting conditions |
| `RATE_INFL_SENSITIVITY` | How strongly rate changes affect inflation |
| `RATE_UNEMP_SENSITIVITY` | How strongly rate changes affect unemployment |
| `LAG_IMMEDIATE` / `LAG_DEFERRED` | Fraction of policy effect felt now vs next quarter |
| `INFL_MEAN_REVERT` / `UNEMP_MEAN_REVERT` | Speed of return to targets |
| `INFL_NOISE` / `UNEMP_NOISE` | Random variation per quarter |
| `SCORE_EXCELLENT` / `SCORE_GOOD` / `SCORE_POOR` | Reappointment thresholds |

---

## Where to Edit Event Text

All shock events are in the `SHOCK_EVENTS` array near the top of `app.js`. Each event has:

- `title` — headline shown in the news panel
- `text` — body paragraph explaining the event
- `inflEffect` — inflation impact this quarter (positive = inflationary)
- `unempEffect` — unemployment impact this quarter (positive = more unemployment)
- `inflLag` / `unempLag` — bleed-over effect into the following quarter

Routine (non-shock) headlines are in the `ROUTINE_NEWS` array.

---

## File Structure

```
index.html    — App shell and all screen layouts
styles.css    — All styling (retro-professional, 2014-era educational tone)
app.js        — Game logic, economic model, rendering, scoring
README.md     — This file
```
