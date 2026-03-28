# Integration Notes — Chair the Fed Swarm Build
> Scout 7 — CSS Audit + Policy Lag Visualization Design
> Date: 2026-03-27

---

## 1. COLOR PALETTE (hex values)

All hardcoded in styles.css — NO CSS custom properties (:root vars). Builders must use these exact values for consistency.

| Name | Hex | Usage |
|------|-----|-------|
| Navy | `#1a2a4a` | Headers, borders, primary text, buttons, chart unemployment line |
| Cream | `#f5f0e8` | Light backgrounds, tip boxes |
| Gold | `#c8a400` | Progress bar, accents, rate chart line, badges |
| Page bg | `#ddd8cc` | Body background |
| White | `#ffffff` | Panel backgrounds |
| Red | `#b22222` | Inflation indicator, breaking news, fired verdict, chart inflation line |
| Green | `#1a6b1a` | Near-target state, good verdict |
| Dark green | `#1a5c1a` | Under-target state |
| Gray | `#666666` | Label text |
| Light gray | `#bbb5a8` | Panel borders |
| Chart grid | `#d8d1c3` | Chart grid lines |
| Chart bg | `#fcfbf7` / `#fdfcf9` | Chart area background |

**Indicator state classes** (applied by setIndicatorClass()):
- `.over-target { color: #b22222 }`
- `.under-target { color: #1a5c1a }`
- `.near-target { color: #1a6b1a }`

**Verdict card modifier classes** (on #end-verdict-card):
- `.excellent` → border `#1a6b1a`, bg `#f0f7f0`
- `.good` → border `#1a2a4a`, bg `#f0f3f7`
- `.poor` → border `#c8a400`, bg `#fdf8ec`
- `.fired` → border `#b22222`, bg `#fdf0f0`

---

## 2. FONT SIZES IN USE

| Context | Font | Size |
|---------|------|------|
| Body | Georgia, serif | 15px base |
| Labels (uppercase) | Arial, sans-serif | 0.65–0.72rem |
| Indicator values | Courier New, monospace | 1.8rem |
| Headline score | Courier New | 3rem (verdict score) |
| News headline | Georgia | 1.35rem |
| Panel titles | Arial (uppercase) | 0.72rem |
| Button text | Arial | 0.9–1.05rem |
| Chart axis | Arial | 10–12px (set via canvas ctx.font) |
| Table | Arial | 0.80rem |

---

## 3. EXISTING ANIMATION / TRANSITION PATTERNS

### CSS Transitions
| Selector | Property | Duration | Easing |
|----------|----------|----------|--------|
| `.btn-primary` | background | 0.15s | default |
| `.btn-go` | background | 0.15s | default |
| `.rate-option` | background | 0.08s | default |
| `.quarter-progress-line` | width | 1.1s | ease |
| `.quarter-progress-marker` | left | 1.1s | ease |

### CSS Keyframes
```css
@keyframes newsFlash {
  0%   { opacity: 0; transform: translateY(-8px); }
  100% { opacity: 1; transform: translateY(0); }
}
/* Applied via .news-alert--flash class, duration 0.8s ease-out */
/* JS: element.classList.add('news-alert--flash'); setTimeout(() => element.classList.remove(...), 850) */
```

### JS-Driven Animation
- `startMainChartAnimation()` — `requestAnimationFrame` loop, 1100ms (`GRAPH_ANIMATION_MS`), cubic easing: `1 - (1 - progress)³`
- All chart drawing happens in `renderMainChart()` called every frame during animation
- `state.chartAnimation.progress` drives interpolation

---

## 4. BROKEN / CLIPPING UI ISSUES SPOTTED

1. **News alert on small screens (≤700px)**: `.news-alert` switches to 1-column but the label padding (`padding: 16px 14px`) still looks chunky. Minor spacing issue.
2. **History table overflow**: Wrapped in `.history-scroll { overflow-x: auto }` — functional but no visual indicator of horizontal scroll on mobile.
3. **Rate selector scroll**: `.rate-selector-scroll { scrollbar-gutter: stable }` is only set for `.panel-side` variant, not the main one. Scrollbar appearance could shift layout slightly.
4. **Chart canvas height on mobile**: drops from 380px to 320px at 860px breakpoint — correct, but may clip labels if many data points.
5. **`.quarter-progress-marker` overflow**: set to `overflow: visible` on the track, but the marker uses `transform: translate(-50%, -50%)` — first marker position (0%) could clip at left edge.

---

## 5. RESPONSIVE BREAKPOINTS

| Breakpoint | Effect |
|-----------|--------|
| `max-width: 1100px` | Game body → 2 cols (indicators | center), side panel moves to row 2 |
| `max-width: 860px` | Game body → 1 col; chart header stacks; chart height 380→320px |
| `max-width: 700px` | Intro body → 1 col; news-alert → 1 col (label stacks above copy) |
| `max-width: 600px` | End stats and end charts → 1 col each |

---

## 6. CSS INSERTION POINTS FOR NEW FEATURES

### A. Difficulty mode UI (intro screen)
Insert after line ~168 (`.intro-footer {}`) in styles.css:
```css
/* --- Difficulty selector (intro screen) --- */
.difficulty-selector { ... }
.difficulty-option { ... }
.difficulty-option.selected { background: #1a2a4a; color: #fff; }
```
Target in index.html: inside `.intro-footer`, before `#btn-start`.

### B. Advisor system (game screen, right panel)
Insert after line ~833 (`.result-footer {}`) in styles.css:
```css
/* --- Advisor panel --- */
.advisor-panel { ... }
.advisor-card { border-left: 3px solid #c8a400; padding: 8px 10px; margin-bottom: 8px; }
.advisor-name { font-family: Arial; font-size: 0.72rem; text-transform: uppercase; color: #666; }
.advisor-recommendation { font-size: 0.85rem; color: #2a2a2a; }
```
Target in index.html: new `.panel` inside `.panel-side`, below `#panel-result`.

### C. Breaking news upgrade (ticker / mood states)
Extend existing `.news-alert` block (~line 468). Add modifier classes:
```css
/* After existing .news-alert-label block */
.news-alert--panic .news-alert-label { background: linear-gradient(135deg, #8f1717, #600e0e); }
.news-alert--calm  .news-alert-label { background: linear-gradient(135deg, #1a6b1a, #145214); }
/* Ticker animation */
@keyframes tickerScroll { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
.news-ticker { overflow: hidden; white-space: nowrap; }
.news-ticker-inner { display: inline-block; animation: tickerScroll 12s linear infinite; }
```

### D. Achievement toast
Append to end of styles.css (new section):
```css
/* --- Achievement toast --- */
.achievement-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 9999;
  background: #1a2a4a; color: #fff;
  border-left: 4px solid #c8a400;
  padding: 12px 16px; max-width: 300px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  animation: toastSlideIn 0.4s ease-out;
}
@keyframes toastSlideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.achievement-toast-title { font-family: Arial; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.12em; color: #c8a400; }
.achievement-toast-name { font-size: 1.0rem; font-weight: bold; margin-top: 2px; }
```

### E. Seeded run / daily challenge (intro screen)
Insert before `.intro-footer` in styles.css:
```css
/* --- Seed / daily challenge UI --- */
.seed-row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.seed-input {
  font-family: Courier New, monospace; font-size: 0.9rem;
  border: 1px solid #c8c0b0; padding: 6px 10px;
  background: #faf8f4; color: #1a2a4a; flex: 1;
}
.seed-badge { background: #c8a400; color: #fff; font-size: 0.68rem; padding: 2px 8px; font-family: Arial; text-transform: uppercase; letter-spacing: 0.08em; }
```

### F. Policy lag ghost line (chart overlay — JS only, no new CSS needed)
The ghost line is drawn directly on the canvas in `renderMainChart()`. No CSS required — see Section 7.

### G. End screen scoring upgrade (verdict card)
CSS is already in place:
- `#end-verdict-card` with `.excellent/.good/.poor/.fired` modifiers — just change the text
- `#end-verdict-title` and `#end-verdict-text` — just update innerHTML content
- Add new `.verdict-tag` badge if needed:
```css
.verdict-tag { display: inline-block; background: #c8a400; color: #fff; font-family: Arial; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.10em; padding: 2px 10px; margin-bottom: 8px; }
```

### H. One-more-turn / quick restart (end screen)
Add below `.end-footer` styles:
```css
.end-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 16px; }
.btn-secondary { background: #fff; color: #1a2a4a; border: 2px solid #1a2a4a; padding: 10px 24px; font-family: Arial; font-size: 0.9rem; cursor: pointer; transition: background 0.15s; }
.btn-secondary:hover { background: #f0f3f7; }
```

---

## 7. POLICY LAG GHOST LINE — CONCRETE IMPLEMENTATION DESIGN

### What it shows
After the player selects a rate and sees the result, there should be a **dashed ghost line** projecting from the current data point forward by 1–2 quarters to show pending lag effects (`state.lagInflEffect`, `state.lagUnempEffect`) that will carry into future turns.

### Which function to modify
**`renderMainChart()`** in app.js (~line 1775). Specifically, add the ghost line drawing AFTER the main series are drawn (after line ~1857) but BEFORE the axis labels.

### What data to pass
The lag values are already in `state.lagInflEffect` and `state.lagUnempEffect` after `finishMainChartAnimation()` runs. No new state needed. The ghost line reads directly from `state`.

### Coordinate system
```
// From renderMainChart() — these are already defined:
const plot = { left: 54, top: 18, right: width - 18, bottom: height - 54 };
const toX = value => plot.left + (value / TOTAL_QUARTERS) * plot.width;
const toY = value => {
  const bounded = Math.max(MAIN_CHART_Y_MIN, Math.min(MAIN_CHART_Y_MAX, value));
  const pct = (bounded - MAIN_CHART_Y_MIN) / (MAIN_CHART_Y_MAX - MAIN_CHART_Y_MIN);
  return plot.bottom - pct * plot.height;
};
// completedQuarter goes 0–16 (maps to x-axis via toX)
// Values go 0–10 (maps to y-axis via toY)
```

### Concrete code snippet

Add this function to app.js (near `drawSharedSeries`, after line ~1773):

```javascript
function drawLagGhostLine(ctx, currentQuarter, currentValue, lagEffect, color, toX, toY) {
  // Only draw if there's a meaningful lag effect
  if (Math.abs(lagEffect) < 0.01) return;
  // Only draw during result or decision phase (not during animation)
  if (state.phase === 'animating') return;

  const projectedValue = currentValue + lagEffect;

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(toX(currentQuarter), toY(currentValue));
  ctx.lineTo(toX(currentQuarter + 1), toY(projectedValue));
  ctx.stroke();

  // Ghost dot at projected endpoint
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(toX(currentQuarter + 1), toY(projectedValue), 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
```

Then in `renderMainChart()`, add after the three `drawSharedSeries` calls (after ~line 1857):

```javascript
  // Draw policy lag ghost lines (pending effects from this quarter's rate decision)
  if (state.phase === 'result' && state.chartPoints.length > 0) {
    const lastPoint = state.chartPoints[state.chartPoints.length - 1];
    const currentQ = lastPoint.completedQuarter;

    drawLagGhostLine(
      ctx,
      currentQ,
      lastPoint.inflation,
      state.lagInflEffect,
      'rgba(178, 34, 34, 0.7)',   // red, semi-transparent
      toX, toY
    );
    drawLagGhostLine(
      ctx,
      currentQ,
      lastPoint.unemployment,
      state.lagUnempEffect,
      'rgba(26, 42, 74, 0.7)',    // navy, semi-transparent
      toX, toY
    );
  }
```

### Visual result
- During the **result phase** (after GO is pressed, before Next Quarter), two short dashed lines project from the last data point one quarter forward
- Inflation ghost: dashed red, semi-transparent
- Unemployment ghost: dashed navy, semi-transparent
- Both terminate in a small ghost dot
- Lines disappear at next quarter (phase changes to 'decision', ghost lines hidden until next result)
- Does NOT appear during animation or decision phases to avoid visual noise

### Why not show the rate lag?
The rate is the player's explicit decision — they see it in the selector. Rate lag is conceptually different (the player controls it). Only showing inflation + unemployment lag is cleaner and more pedagogically useful.

### Adding a legend label (optional)
If desired, add a legend entry to `.chart-legend` in index.html:
```html
<span class="legend-item">
  <span class="legend-line" style="border-color: rgba(26,42,74,0.5); border-style: dashed;"></span>
  Lag Effect (projected)
</span>
```

---

## 8. CRITICAL REMINDER FOR ALL BUILDERS

**app.js has DUPLICATE function definitions.** The v1 functions (lines ~988–1093) are dead code. The v2 functions (lines ~1094–1965+) are the active ones. Always edit the v2 versions:

| Function | v1 (dead) approx. | v2 (active) approx. |
|----------|-------------------|---------------------|
| `startGame` | ~993 | ~1519 / ~1940 |
| `beginQuarter` | ~998 | ~1528 / ~1950 |
| `makeDecision` | ~1005 | ~1543 / ~1965 |
| `nextQuarter` | ~1073 | ~1597 |
| `resetGame` | ~1086 | ~1609 |
| `createInitialState` | ~271 | ~1671 |
| `getVerdict` | ~411 | ~1129 |
| `renderEndScreen` | ~904 | ~1330 |

**When in doubt: search for the function and edit the one closest to the END of the file.**
