/* ==========================================================================
   CHAIR THE FED — app.js
   A monetary policy simulation game based on the Federal Reserve Bank of
   San Francisco "Chair the Fed" classroom game.

   Architecture:
     1. CONSTANTS / TUNING  — targets, sensitivity, thresholds (edit here)
     2. SHOCK EVENTS        — prewritten event cards (edit text/effects here)
     3. GAME STATE          — single source of truth
     4. ECONOMIC MODEL      — simulation formulas (edit model here)
     5. SCORING SYSTEM      — reappointment evaluation
     6. RENDERING / UI      — DOM updates and sparklines
     7. GAME FLOW           — init, decision, next quarter, reset
   ========================================================================== */


/* ==========================================================================
   1. CONSTANTS / TUNING
   ========================================================================== */

// === TUNING: Targets ===
const TARGET_INFLATION    = 2.0;   // Fed inflation target (%)
const TARGET_UNEMPLOYMENT = 5.0;   // Natural unemployment rate (%)

// === TUNING: Starting economic conditions ===
const INIT_INFLATION    = 2.4;     // Starting inflation (%)
const INIT_UNEMPLOYMENT = 5.5;     // Starting unemployment (%)
const INIT_RATE         = 4.25;    // Starting fed funds rate (%)

// === TUNING: Rate bounds ===
const RATE_MIN = 0.25;             // Floor for fed funds rate
const RATE_MAX = 10.0;             // Ceiling for fed funds rate
const RATE_STEP = 0.25;            // Increment per notch

// === TUNING: Policy sensitivity
// These control how strongly rate changes pass through to the economy.
// Higher = more responsive economy.
const RATE_INFL_SENSITIVITY  = 0.18;  // Each 1% rate change → this much inflation impact
const RATE_UNEMP_SENSITIVITY = 0.14;  // Each 1% rate change → this much unemployment impact

// === TUNING: Lag (policy takes time to fully work)
// LAG_IMMEDIATE: fraction of effect felt this quarter
// LAG_DEFERRED:  fraction felt next quarter (should sum to ~1.0)
const LAG_IMMEDIATE = 0.45;
const LAG_DEFERRED  = 0.55;

// === TUNING: Momentum / mean-reversion
// How strongly the economy drifts back toward "normal" each quarter
const INFL_MEAN_REVERT  = 0.08;   // pull toward TARGET_INFLATION
const UNEMP_MEAN_REVERT = 0.07;   // pull toward TARGET_UNEMPLOYMENT

// === TUNING: Random noise magnitude
const INFL_NOISE  = 0.15;   // max random ± on inflation each quarter
const UNEMP_NOISE = 0.12;   // max random ± on unemployment each quarter

// === TUNING: Value bounds (hard clamps)
const INFL_MIN  = -1.0;
const INFL_MAX  = 15.0;
const UNEMP_MIN = 2.0;
const UNEMP_MAX = 15.0;

// === TUNING: Scoring weights and thresholds ===
const INFL_WEIGHT        = 1.0;   // relative importance of inflation in scoring
const UNEMP_WEIGHT       = 1.0;   // relative importance of unemployment in scoring
const MAX_AVG_PENALTY    = 5.0;   // penalty at which score hits 0
const SCORE_EXCELLENT    = 80;
const SCORE_GOOD         = 60;
const SCORE_POOR         = 40;

// Total quarters in the simulation
const TOTAL_QUARTERS = 16;


/* ==========================================================================
   2. SHOCK / EVENT SYSTEM
   Edit event titles, text, and economic effects here.

   inflEffect  (+) = upward pressure on inflation this quarter
   unempEffect (+) = upward pressure on unemployment this quarter
   inflLag     = bleed-over inflation effect to following quarter
   unempLag    = bleed-over unemployment effect to following quarter
   ========================================================================== */

// === TUNING: Shock / event cards ===
const SHOCK_EVENTS = [
  {
    id: 'oil_spike',
    title: 'Oil Price Spike',
    badge: 'BREAKING',
    text: 'Global oil prices have surged following supply disruptions in major producing regions. Energy costs for consumers and businesses are rising sharply, pushing up prices across the economy.',
    inflEffect:  0.40,
    unempEffect: 0.25,
    inflLag:     0.20,
    unempLag:    0.10
  },
  {
    id: 'spending_slowdown',
    title: 'Consumer Spending Slowdown',
    badge: 'BREAKING',
    text: 'Retail sales fell for the second consecutive month as consumers pull back on discretionary spending. Businesses are responding by trimming payrolls and slowing investment.',
    inflEffect: -0.30,
    unempEffect: 0.35,
    inflLag:    -0.10,
    unempLag:    0.15
  },
  {
    id: 'housing_boom',
    title: 'Housing Market Boom',
    badge: 'BREAKING',
    text: 'Home prices and construction activity are at multi-year highs. Strong demand for housing is spilling over into consumer confidence and broader spending, adding to inflationary pressure.',
    inflEffect:  0.30,
    unempEffect:-0.20,
    inflLag:     0.15,
    unempLag:   -0.10
  },
  {
    id: 'financial_stress',
    title: 'Financial Market Stress',
    badge: 'BREAKING',
    text: 'Volatility in financial markets has tightened credit conditions significantly. Banks have pulled back on lending to consumers and businesses, threatening to slow economic growth.',
    inflEffect: -0.20,
    unempEffect: 0.45,
    inflLag:    -0.10,
    unempLag:    0.20
  },
  {
    id: 'strong_dollar',
    title: 'Stronger Dollar',
    badge: 'UPDATE',
    text: 'The U.S. dollar has strengthened significantly against major currencies. This is holding down import prices, providing relief on inflation, but American exporters are facing a competitive headwind.',
    inflEffect: -0.30,
    unempEffect: 0.15,
    inflLag:    -0.15,
    unempLag:    0.05
  },
  {
    id: 'productivity',
    title: 'Productivity Improvement',
    badge: 'UPDATE',
    text: 'A wave of business efficiency gains — driven largely by technology adoption — is allowing companies to produce more with fewer resources. This is restraining both price and wage growth.',
    inflEffect: -0.25,
    unempEffect:-0.20,
    inflLag:    -0.10,
    unempLag:   -0.10
  },
  {
    id: 'supply_disruption',
    title: 'Supply Chain Disruption',
    badge: 'BREAKING',
    text: 'Major port congestion and transportation bottlenecks are causing widespread shortages of goods. Delivery times have lengthened and supplier prices are rising, adding to inflationary pressure.',
    inflEffect:  0.45,
    unempEffect: 0.20,
    inflLag:     0.25,
    unempLag:    0.10
  },
  {
    id: 'fiscal_stimulus',
    title: 'Fiscal Stimulus Package',
    badge: 'BREAKING',
    text: 'Congress has passed a significant fiscal stimulus bill. Direct payments to households and infrastructure spending are expected to boost demand substantially over the coming quarters.',
    inflEffect:  0.30,
    unempEffect:-0.30,
    inflLag:     0.15,
    unempLag:   -0.15
  },
  {
    id: 'global_slowdown',
    title: 'Global Economic Slowdown',
    badge: 'BREAKING',
    text: 'Growth is decelerating sharply in major trading partners. Weakening overseas demand is hitting U.S. exports, and business investment plans are being scaled back.',
    inflEffect: -0.30,
    unempEffect: 0.35,
    inflLag:    -0.15,
    unempLag:    0.15
  },
  {
    id: 'wage_surge',
    title: 'Wage Growth Acceleration',
    badge: 'UPDATE',
    text: 'Labor Department data shows wage growth running well above recent norms. While workers benefit from rising paychecks, the wage-price spiral risk is drawing attention from policymakers.',
    inflEffect:  0.35,
    unempEffect:-0.10,
    inflLag:     0.15,
    unempLag:    0.00
  },
  {
    id: 'tech_boom',
    title: 'Technology Sector Boom',
    badge: 'UPDATE',
    text: 'Investment and hiring in the technology sector are accelerating. Tech companies are absorbing a large share of the workforce, pushing down headline unemployment while keeping a lid on goods prices.',
    inflEffect:  0.10,
    unempEffect:-0.30,
    inflLag:     0.05,
    unempLag:   -0.10
  },
  {
    id: 'banking_stress',
    title: 'Banking Sector Stress',
    badge: 'BREAKING',
    text: 'Several regional banks are reporting significant losses. The resulting tightening of credit standards is damping investment and consumer spending, raising recession concerns.',
    inflEffect: -0.15,
    unempEffect: 0.40,
    inflLag:    -0.10,
    unempLag:    0.15
  },
  {
    id: 'energy_drop',
    title: 'Energy Price Drop',
    badge: 'UPDATE',
    text: 'A surge in global energy production has sent oil and natural gas prices sharply lower. Consumers are seeing lower prices at the pump and in utility bills, providing a boost to real incomes.',
    inflEffect: -0.35,
    unempEffect:-0.10,
    inflLag:    -0.15,
    unempLag:    0.00
  },
  {
    id: 'import_prices',
    title: 'Import Price Increase',
    badge: 'UPDATE',
    text: 'New tariffs and a weaker dollar are raising the cost of imported goods. Businesses are beginning to pass these higher costs on to consumers, adding upward pressure to inflation.',
    inflEffect:  0.30,
    unempEffect: 0.10,
    inflLag:     0.15,
    unempLag:    0.05
  },
  {
    id: 'consumer_confidence',
    title: 'Consumer Confidence Surge',
    badge: 'UPDATE',
    text: 'A widely watched consumer sentiment index hit its highest level in years. Households are increasing spending on big-ticket items, lifting demand and putting mild upward pressure on prices.',
    inflEffect:  0.20,
    unempEffect:-0.20,
    inflLag:     0.10,
    unempLag:   -0.10
  },
  {
    id: 'spending_cuts',
    title: 'Government Spending Cuts',
    badge: 'UPDATE',
    text: 'Congress has reached a deficit reduction agreement that includes significant cuts to federal spending. The resulting fiscal drag is expected to weigh on economic activity over coming quarters.',
    inflEffect: -0.20,
    unempEffect: 0.30,
    inflLag:    -0.10,
    unempLag:    0.15
  }
];

// Routine news headlines (used for "quiet" quarters with no shock)
// === TUNING: Routine news headlines ===
const ROUTINE_NEWS = [
  'Economic data released this quarter was broadly in line with expectations. Consumer spending and business investment continue at a moderate pace.',
  'Labor markets remain steady with no major surprises. The economic expansion continues, though the pace of growth is moderate.',
  'Inflation readings came in close to forecasts this quarter. Supply and demand conditions appear broadly balanced across most sectors.',
  'Survey data suggests businesses are cautiously optimistic. Capital expenditure plans are holding steady as firms await greater certainty.',
  'Trade data for the quarter showed a slight narrowing of the current account deficit. Export growth was modest while import demand held firm.',
  'Housing starts and building permits were little changed. The residential real estate market is showing signs of gradual stabilization.',
  'Business investment in equipment and software rose modestly. Technology spending continues to lead as firms seek efficiency improvements.'
];


/* ==========================================================================
   3. GAME STATE
   Single source of truth for all runtime data.
   ========================================================================== */
let state = {};

function createInitialState() {
  // Build the shock schedule for 16 quarters.
  // We pick ~10 shock quarters and ~6 quiet quarters, in a shuffled order.
  const shockSchedule = buildShockSchedule();

  return {
    quarter:           1,
    inflation:         INIT_INFLATION,
    unemployment:      INIT_UNEMPLOYMENT,
    fedRate:           INIT_RATE,
    pendingRate:       INIT_RATE,       // rate player has selected but not yet confirmed
    lagInflEffect:     0,               // deferred inflation effect from last decision
    lagUnempEffect:    0,               // deferred unemployment effect from last decision
    history:           [],              // array of completed-quarter records
    shockSchedule:     shockSchedule,   // array[16] of shock or null
    cumulativePenalty: 0,
    phase:             'decision'       // 'decision' | 'result'
  };
}

// Build a shuffled schedule assigning shocks to quarters
function buildShockSchedule() {
  // Shuffle shocks and pick 10
  const shuffled = [...SHOCK_EVENTS].sort(() => Math.random() - 0.5);
  const chosen   = shuffled.slice(0, 10);

  // Create 16-slot array: 10 shock slots, 6 null (routine)
  const schedule = [
    ...chosen,
    null, null, null, null, null, null
  ].sort(() => Math.random() - 0.5);

  return schedule;
}


/* ==========================================================================
   4. ECONOMIC MODEL
   All simulation math lives here. Adjust sensitivities and formulas here.
   ========================================================================== */

/**
 * Advance the economy by one quarter.
 * @param {number} rateDelta - Change in fed funds rate chosen this quarter
 * @returns {object} - { newInflation, newUnemployment, inflDelta, unempDelta }
 */
function advanceEconomy(rateDelta) {
  const shock = state.shockSchedule[state.quarter - 1];

  // --- Shock effects this quarter ---
  const shockInfl  = shock ? shock.inflEffect  : 0;
  const shockUnemp = shock ? shock.unempEffect : 0;

  // --- Policy transmission (with lag split) ---
  // Rate increase (positive delta) → downward pressure on inflation,
  //                                   upward pressure on unemployment.
  // This quarter: immediate fraction
  const directInfl  = -rateDelta * RATE_INFL_SENSITIVITY  * LAG_IMMEDIATE;
  const directUnemp = +rateDelta * RATE_UNEMP_SENSITIVITY * LAG_IMMEDIATE;

  // --- Apply deferred effect from PREVIOUS quarter's decision ---
  const lagInfl  = state.lagInflEffect;
  const lagUnemp = state.lagUnempEffect;

  // --- Mean reversion (economy drifts toward targets) ---
  const meanRevertInfl  = (TARGET_INFLATION    - state.inflation)    * INFL_MEAN_REVERT;
  const meanRevertUnemp = (TARGET_UNEMPLOYMENT - state.unemployment) * UNEMP_MEAN_REVERT;

  // --- Random noise ---
  const noiseInfl  = (Math.random() * 2 - 1) * INFL_NOISE;
  const noiseUnemp = (Math.random() * 2 - 1) * UNEMP_NOISE;

  // --- Combine all effects ---
  const inflDelta  = directInfl  + lagInfl  + shockInfl  + meanRevertInfl  + noiseInfl;
  const unempDelta = directUnemp + lagUnemp + shockUnemp + meanRevertUnemp + noiseUnemp;

  // --- Compute new values and clamp to bounds ---
  let newInflation    = Math.max(INFL_MIN,  Math.min(INFL_MAX,  state.inflation    + inflDelta));
  let newUnemployment = Math.max(UNEMP_MIN, Math.min(UNEMP_MAX, state.unemployment + unempDelta));

  // Round to 2 decimal places for display cleanliness
  newInflation    = Math.round(newInflation    * 100) / 100;
  newUnemployment = Math.round(newUnemployment * 100) / 100;

  // --- Store deferred effects for next quarter ---
  const nextLagInfl  = -rateDelta * RATE_INFL_SENSITIVITY  * LAG_DEFERRED
                       + (shock ? shock.inflLag  : 0);
  const nextLagUnemp = +rateDelta * RATE_UNEMP_SENSITIVITY * LAG_DEFERRED
                       + (shock ? shock.unempLag : 0);

  return { newInflation, newUnemployment, inflDelta, unempDelta,
           nextLagInfl, nextLagUnemp };
}


/* ==========================================================================
   5. SCORING SYSTEM
   ========================================================================== */

/**
 * Calculate the penalty for the current quarter (before economy has advanced).
 * Lower penalty = better performance.
 */
function calcQuarterPenalty(inflation, unemployment) {
  const inflPenalty  = Math.abs(inflation    - TARGET_INFLATION)    * INFL_WEIGHT;
  const unempPenalty = Math.abs(unemployment - TARGET_UNEMPLOYMENT) * UNEMP_WEIGHT;
  return inflPenalty + unempPenalty;
}

/**
 * Convert cumulative penalty into a 0–100 score.
 */
function calcFinalScore(totalPenalty) {
  const avgPenalty = totalPenalty / TOTAL_QUARTERS;
  return Math.max(0, Math.round(100 - (avgPenalty / MAX_AVG_PENALTY) * 100));
}

/**
 * Return the reappointment verdict object for a given score.
 */
function getVerdict(score) {
  if (score >= SCORE_EXCELLENT) {
    return {
      cssClass: 'excellent',
      title: 'Reappointed with Distinction',
      text: 'The Federal Open Market Committee has voted unanimously to recommend your reappointment. ' +
            'You successfully navigated the economy through a challenging period, keeping both inflation ' +
            'and unemployment close to their targets. Your steady hand and sound judgment have earned ' +
            'the confidence of the Committee and the public.'
    };
  }
  if (score >= SCORE_GOOD) {
    return {
      cssClass: 'good',
      title: 'Reappointed',
      text: 'The Senate has confirmed you for another term as Federal Reserve Chair. ' +
            'While there were periods when the economy drifted from its targets, your overall management ' +
            'of monetary policy was sound. The Committee acknowledged the difficult conditions you faced ' +
            'and expressed confidence in your continued leadership.'
    };
  }
  if (score >= SCORE_POOR) {
    return {
      cssClass: 'poor',
      title: 'Not Reappointed',
      text: 'The President has nominated a new Chair of the Federal Reserve. ' +
            'Inflation and unemployment strayed too far from their targets during your tenure. ' +
            'Economists and policymakers have questioned whether your rate decisions responded ' +
            'quickly enough to changing economic conditions. Your term ends without a second appointment.'
    };
  }
  return {
    cssClass: 'fired',
    title: 'Removed from Office',
    text: 'Congress has passed a resolution calling for your removal, and the President has acted on it. ' +
          'Your management of monetary policy was judged to have caused significant harm to the economy. ' +
          'Both inflation and unemployment reached levels that the public and policymakers found unacceptable. ' +
          'This outcome will be studied in economics courses for years to come.'
  };
}


/* ==========================================================================
   6. RENDERING / UI
   All DOM manipulation and canvas drawing lives here.
   ========================================================================== */

/** Toggle between named screens */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/** Format a number to fixed decimal places, with sign option */
function fmt(val, dec = 2, sign = false) {
  const s = Math.abs(val).toFixed(dec);
  if (sign) return (val >= 0 ? '+' : '−') + s;
  return s;
}

/** Update the game header (quarter + score) */
function renderHeader() {
  document.getElementById('hdr-quarter').textContent =
    state.quarter + ' / ' + TOTAL_QUARTERS;
  const remaining = TOTAL_QUARTERS - state.quarter + 1;
  // Score display: show running score after at least 1 quarter logged
  if (state.history.length > 0) {
    const currentScore = calcFinalScore(state.cumulativePenalty * (TOTAL_QUARTERS / state.history.length));
    document.getElementById('hdr-score').textContent = currentScore;
  } else {
    document.getElementById('hdr-score').textContent = '—';
  }
}

/** Update the three economic indicators and their status colors */
function renderIndicators() {
  const inflEl   = document.getElementById('val-inflation');
  const unempEl  = document.getElementById('val-unemployment');
  const rateEl   = document.getElementById('val-rate');

  inflEl.textContent  = fmt(state.inflation)    + '%';
  unempEl.textContent = fmt(state.unemployment) + '%';
  rateEl.textContent  = fmt(state.fedRate)      + '%';

  // Color-code distance from target
  setIndicatorClass(inflEl,  state.inflation,    TARGET_INFLATION,    0.5, 1.5);
  setIndicatorClass(unempEl, state.unemployment, TARGET_UNEMPLOYMENT, 0.5, 1.5);
}

function setIndicatorClass(el, val, target, nearThresh, warnThresh) {
  el.classList.remove('near-target', 'over-target', 'under-target');
  const diff = val - target;
  if (Math.abs(diff) <= nearThresh) {
    el.classList.add('near-target');
  } else if (diff > warnThresh) {
    el.classList.add('over-target');
  } else if (diff < -warnThresh) {
    el.classList.add('under-target');
  } else if (diff > 0) {
    el.classList.add('over-target');
  } else {
    el.classList.add('under-target');
  }
}

/** Render the news / event card for the current quarter */
function renderNews() {
  const shock = state.shockSchedule[state.quarter - 1];
  const label = document.getElementById('news-quarter-label');
  const badge = document.getElementById('news-badge');
  const body  = document.getElementById('news-body');

  // Quarter label — show quarter number and year
  const year = 2020 + Math.floor((state.quarter - 1) / 4);
  const qNum = ((state.quarter - 1) % 4) + 1;
  label.textContent = 'Q' + qNum + ' ' + year + ' — Economic Briefing';

  // Clear body and build content with safe DOM methods (no innerHTML)
  body.textContent = '';

  if (shock) {
    badge.textContent = shock.badge;
    badge.className   = 'news-badge shock';

    var titleEl = document.createElement('p');
    titleEl.className = 'event-title';
    titleEl.textContent = shock.title;
    body.appendChild(titleEl);

    var textEl = document.createElement('p');
    textEl.textContent = shock.text;
    body.appendChild(textEl);
  } else {
    badge.textContent = 'ROUTINE';
    badge.className   = 'news-badge routine';
    const routine     = ROUTINE_NEWS[state.quarter % ROUTINE_NEWS.length];

    var routineEl = document.createElement('p');
    routineEl.textContent = routine;
    body.appendChild(routineEl);
  }

  // Append extra context about current conditions
  const inflNote = state.inflation > TARGET_INFLATION + 0.5
    ? 'Inflation is running above the Fed\'s 2% target.'
    : state.inflation < TARGET_INFLATION - 0.5
    ? 'Inflation is below the Fed\'s 2% target.'
    : 'Inflation is near the Fed\'s 2% target.';

  const unempNote = state.unemployment > TARGET_UNEMPLOYMENT + 0.5
    ? 'Unemployment is above the natural rate of 5%.'
    : state.unemployment < TARGET_UNEMPLOYMENT - 0.5
    ? 'Unemployment is below the natural rate of 5%.'
    : 'Unemployment is near its natural rate of 5%.';

  var noteEl = document.createElement('p');
  noteEl.style.marginTop = '8px';
  noteEl.style.fontStyle = 'italic';
  noteEl.style.color = '#555';
  noteEl.style.fontSize = '0.83rem';
  noteEl.textContent = inflNote + ' ' + unempNote;
  body.appendChild(noteEl);
}

/** Build and render the rate selector panel */
function renderRateSelector() {
  const container = document.getElementById('rate-selector-list');
  if (!container) return;

  // Generate rate options from min to max in steps of RATE_STEP
  // Use integer-based loop to avoid floating-point accumulation errors
  let html = '';
  var totalSteps = Math.round((RATE_MAX - RATE_MIN) / RATE_STEP);
  for (var i = 0; i <= totalSteps; i++) {
    const rv     = Math.round((RATE_MAX - i * RATE_STEP) * 100) / 100;
    const sel    = Math.abs(rv - state.pendingRate) < 0.001;
    const isCurr = Math.abs(rv - state.fedRate)     < 0.001;
    const cls    = sel ? 'rate-option selected' : isCurr ? 'rate-option current' : 'rate-option';
    html += `<div class="${cls}" data-rate="${rv}">`
          + `<span class="rate-val">${fmt(rv)}%</span>`
          + (isCurr ? '<span class="rate-tag current-tag">CURRENT</span>' : '')
          + (sel && !isCurr ? '<span class="rate-tag select-tag">SELECTED</span>' : '')
          + '</div>';
  }
  container.innerHTML = html;

  // Attach click listeners using event delegation (no inline onclick)
  container.addEventListener('click', function(e) {
    var rateEl = e.target.closest('[data-rate]');
    if (rateEl) {
      selectRate(parseFloat(rateEl.getAttribute('data-rate')));
    }
  });

  // Scroll the selected rate into view
  setTimeout(() => {
    const sel = container.querySelector('.selected');
    if (sel) sel.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 50);

  // Show rate change summary
  const delta = Math.round((state.pendingRate - state.fedRate) * 100) / 100;
  const sumEl = document.getElementById('rate-change-summary');
  if (sumEl) {
    if (Math.abs(delta) < 0.001) {
      sumEl.textContent = 'No change — Hold steady at ' + fmt(state.fedRate) + '%';
      sumEl.className = 'rate-change-summary hold';
    } else if (delta > 0) {
      sumEl.textContent = '▲ Raise ' + fmt(delta) + '% → New rate: ' + fmt(state.pendingRate) + '%';
      sumEl.className = 'rate-change-summary raise';
    } else {
      sumEl.textContent = '▼ Lower ' + fmt(Math.abs(delta)) + '% → New rate: ' + fmt(state.pendingRate) + '%';
      sumEl.className = 'rate-change-summary lower';
    }
  }
}

/** Handle rate option click */
function selectRate(rate) {
  if (state.phase !== 'decision') return;
  state.pendingRate = Math.max(RATE_MIN, Math.min(RATE_MAX, Math.round(rate * 100) / 100));
  renderRateSelector();
}

/** Append one row to the in-game history table */
function appendHistoryRow(record) {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  const year = 2020 + Math.floor((record.quarter - 1) / 4);
  const qNum = ((record.quarter - 1) % 4) + 1;
  const inflClass  = getDeviationClass(record.inflation,    TARGET_INFLATION,    0.5);
  const unempClass = getDeviationClass(record.unemployment, TARGET_UNEMPLOYMENT, 0.5);

  const row = document.createElement('tr');
  var cells = [
    { text: 'Q' + qNum + ' ' + year, cls: '' },
    { text: fmt(record.inflation) + '%', cls: inflClass },
    { text: fmt(record.unemployment) + '%', cls: unempClass },
    { text: fmt(record.rate) + '%', cls: '' },
    { text: record.decision, cls: '' },
    { text: record.eventTitle || '\u2014', cls: '' }
  ];
  cells.forEach(function(c) {
    var td = document.createElement('td');
    td.textContent = c.text;
    if (c.cls) td.className = c.cls;
    row.appendChild(td);
  });
  tbody.appendChild(row);

  // Auto-scroll history table
  const histDiv = tbody.closest('.history-scroll');
  if (histDiv) histDiv.scrollTop = histDiv.scrollHeight;
}

function getDeviationClass(val, target, thresh) {
  if (val > target + thresh)  return 'cell-high';
  if (val < target - thresh)  return 'cell-low';
  return '';
}

/** Render the result panel after a decision */
function renderResult(rateDelta, newInfl, newUnemp, qPenalty) {
  const body = document.getElementById('result-body');

  const prevInfl  = state.history.length > 0
    ? state.history[state.history.length - 1].inflation    : INIT_INFLATION;
  const prevUnemp = state.history.length > 0
    ? state.history[state.history.length - 1].unemployment : INIT_UNEMPLOYMENT;

  const inflSign  = newInfl  >= prevInfl  ? '▲' : '▼';
  const unempSign = newUnemp >= prevUnemp ? '▲' : '▼';

  const decisionText = Math.abs(rateDelta) < 0.001
    ? 'You held the rate steady at ' + fmt(state.fedRate) + '%.'
    : rateDelta > 0
    ? 'You raised the rate by ' + fmt(rateDelta) + '% to ' + fmt(state.fedRate) + '%.'
    : 'You lowered the rate by ' + fmt(Math.abs(rateDelta)) + '% to ' + fmt(state.fedRate) + '%.';

  // Build result content with safe DOM methods (no innerHTML)
  body.textContent = '';

  var decisionPara = document.createElement('p');
  decisionPara.style.marginBottom = '10px';
  decisionPara.textContent = decisionText;
  body.appendChild(decisionPara);

  // Helper: build a result-stat row
  function buildStat(labelText, valueText) {
    var div = document.createElement('div');
    div.className = 'result-stat';
    var lbl = document.createElement('span');
    lbl.className = 'label';
    lbl.textContent = labelText;
    div.appendChild(lbl);
    var val = document.createElement('span');
    val.textContent = valueText;
    div.appendChild(val);
    return div;
  }

  body.appendChild(buildStat('Inflation',
    inflSign + ' ' + fmt(prevInfl) + '% \u2192 ' + fmt(newInfl) + '%  (target 2.0%)'));
  body.appendChild(buildStat('Unemployment',
    unempSign + ' ' + fmt(prevUnemp) + '% \u2192 ' + fmt(newUnemp) + '%  (target 5.0%)'));
  body.appendChild(buildStat('Fed Funds Rate', fmt(state.fedRate) + '%'));

  // Quarter score display
  const qs = document.getElementById('result-quarter-score');
  if (qs) {
    qs.textContent = fmt(qPenalty, 2) + ' deviation pts';
    qs.style.color = qPenalty < 1.0 ? '#1a6b1a' : qPenalty < 2.5 ? '#c8a400' : '#b22222';
  }

  // Adjust next-button text on final quarter
  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) {
    nextBtn.textContent = state.quarter > TOTAL_QUARTERS
      ? 'View Final Results →'
      : 'Next Quarter →';
  }
}

/* ---- Sparkline chart drawing ---- */

/**
 * Draw a sparkline on a canvas element.
 * @param {string} canvasId  - DOM id
 * @param {number[]} values  - data points
 * @param {number} target    - draw a dashed horizontal target line
 * @param {string} color     - line color
 * @param {number} yMin      - y-axis min
 * @param {number} yMax      - y-axis max
 */
function drawSparkline(canvasId, values, target, color, yMin, yMax) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || values.length < 1) return;

  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  const pad = 4;

  ctx.clearRect(0, 0, W, H);

  // Guard against division by zero if bounds are equal
  if (yMax === yMin) yMax = yMin + 1;

  const toX = i  => pad + (i / Math.max(values.length - 1, 1)) * (W - pad * 2);
  const toY = v  => pad + (1 - (v - yMin) / (yMax - yMin)) * (H - pad * 2);

  // Target line
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const ty = toY(target);
  ctx.moveTo(pad, ty);
  ctx.lineTo(W - pad, ty);
  ctx.stroke();
  ctx.restore();

  if (values.length < 2) return;

  // Data line
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.8;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = toX(i);
    const y = toY(v);
    if (i === 0) ctx.moveTo(x, y);
    else         ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dot at current value
  if (values.length > 0) {
    const last = values[values.length - 1];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(toX(values.length - 1), toY(last), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Redraw all three in-game sparklines from history */
function renderSparklines() {
  const inflHistory  = state.history.map(r => r.inflation);
  const unempHistory = state.history.map(r => r.unemployment);
  const rateHistory  = state.history.map(r => r.rate);

  // Add current values
  inflHistory.push(state.inflation);
  unempHistory.push(state.unemployment);
  rateHistory.push(state.fedRate);

  drawSparkline('chart-inflation',    inflHistory,  TARGET_INFLATION,    '#b22222', 0,   8);
  drawSparkline('chart-unemployment', unempHistory, TARGET_UNEMPLOYMENT, '#1a2a4a', 2,  12);
  drawSparkline('chart-rate',         rateHistory,  INIT_RATE,           '#c8a400', 0,  10);
}

/** Draw end-screen charts (larger versions) */
function renderEndCharts() {
  const inflHistory  = state.history.map(r => r.inflation);
  const unempHistory = state.history.map(r => r.unemployment);
  const rateHistory  = state.history.map(r => r.rate);

  drawEndChart('end-chart-inflation',    inflHistory,  TARGET_INFLATION,    '#b22222', 0,  8);
  drawEndChart('end-chart-unemployment', unempHistory, TARGET_UNEMPLOYMENT, '#1a2a4a', 2, 12);
  drawEndChart('end-chart-rate',         rateHistory,  INIT_RATE,           '#c8a400', 0, 10);
}

function drawEndChart(canvasId, values, target, color, yMin, yMax) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || values.length < 1) return;

  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  const pad = 6;

  ctx.clearRect(0, 0, W, H);

  // Guard against division by zero if bounds are equal
  if (yMax === yMin) yMax = yMin + 1;

  const n   = values.length;
  const toX = i => pad + (i / Math.max(n - 1, 1)) * (W - pad * 2);
  const toY = v => pad + (1 - (v - yMin) / (yMax - yMin)) * (H - pad * 2);

  // Background shading of target zone
  ctx.save();
  ctx.fillStyle = 'rgba(100,180,100,0.06)';
  ctx.fillRect(pad, toY(target + 0.5), W - pad * 2, toY(target - 0.5) - toY(target + 0.5));
  ctx.restore();

  // Target dashed line
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, toY(target));
  ctx.lineTo(W - pad, toY(target));
  ctx.stroke();
  ctx.restore();

  if (n < 2) return;

  // Area fill
  ctx.save();
  ctx.beginPath();
  values.forEach((v, i) => {
    if (i === 0) ctx.moveTo(toX(i), toY(v));
    else         ctx.lineTo(toX(i), toY(v));
  });
  ctx.lineTo(toX(n - 1), H);
  ctx.lineTo(toX(0), H);
  ctx.closePath();
  // Convert hex color to rgba for translucent area fill
  var r = parseInt(color.slice(1, 3), 16);
  var g = parseInt(color.slice(3, 5), 16);
  var b = parseInt(color.slice(5, 7), 16);
  ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.12)';
  ctx.fill();
  ctx.restore();

  // Line
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  values.forEach((v, i) => {
    if (i === 0) ctx.moveTo(toX(i), toY(v));
    else         ctx.lineTo(toX(i), toY(v));
  });
  ctx.stroke();

  // Dots for each quarter
  values.forEach((v, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(toX(i), toY(v), 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/** Populate the end-screen full history table */
function renderEndHistory() {
  const tbody = document.getElementById('end-history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.history.forEach(record => {
    const year    = 2020 + Math.floor((record.quarter - 1) / 4);
    const qNum    = ((record.quarter - 1) % 4) + 1;
    const inflClass  = getDeviationClass(record.inflation,    TARGET_INFLATION,    0.5);
    const unempClass = getDeviationClass(record.unemployment, TARGET_UNEMPLOYMENT, 0.5);
    const row = document.createElement('tr');
    var cells = [
      { text: 'Q' + qNum + ' ' + year, cls: '' },
      { text: fmt(record.inflation) + '%', cls: inflClass },
      { text: fmt(record.unemployment) + '%', cls: unempClass },
      { text: fmt(record.rate) + '%', cls: '' },
      { text: record.decision, cls: '' },
      { text: record.eventTitle || '\u2014', cls: '' }
    ];
    cells.forEach(function(c) {
      var td = document.createElement('td');
      td.textContent = c.text;
      if (c.cls) td.className = c.cls;
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
}

/** Render the full end screen */
function renderEndScreen() {
  if (state.history.length === 0) return;
  const finalScore = calcFinalScore(state.cumulativePenalty);
  const verdict    = getVerdict(finalScore);

  // Verdict card
  const card = document.getElementById('end-verdict-card');
  card.className = 'end-verdict-card ' + verdict.cssClass;
  document.getElementById('end-verdict-title').textContent = verdict.title;
  document.getElementById('end-score').textContent         = finalScore + ' / 100';
  document.getElementById('end-verdict-text').textContent  = verdict.text;

  // Stats
  const avgInfl  = state.history.reduce((s, r) => s + r.inflation,    0) / state.history.length;
  const avgUnemp = state.history.reduce((s, r) => s + r.unemployment, 0) / state.history.length;

  document.getElementById('end-avg-infl').textContent   = fmt(avgInfl)  + '%';
  document.getElementById('end-avg-unemp').textContent  = fmt(avgUnemp) + '%';
  document.getElementById('end-final-rate').textContent = fmt(state.fedRate) + '%';

  // Color end stats
  setIndicatorClass(document.getElementById('end-avg-infl'),  avgInfl,  TARGET_INFLATION,    0.5, 1.5);
  setIndicatorClass(document.getElementById('end-avg-unemp'), avgUnemp, TARGET_UNEMPLOYMENT, 0.5, 1.5);

  renderEndCharts();
  renderEndHistory();

  // List shock events that occurred
  const shocksOccurred = state.history
    .filter(r => r.eventTitle && r.eventTitle !== '—')
    .map(r => r.eventTitle);
  if (shocksOccurred.length > 0) {
    const shockNote = document.createElement('p');
    shockNote.style.cssText = 'font-size:0.83rem;color:#555;text-align:center;margin:8px 0 0;font-style:italic;';
    shockNote.textContent   = 'Events during your term: ' + [...new Set(shocksOccurred)].join(', ') + '.';
    document.getElementById('end-verdict-card').appendChild(shockNote);
  }
}


/* ==========================================================================
   7. GAME FLOW
   ========================================================================== */

/** Called by the "Begin Simulation" button on the intro screen */
function startGame() {
  state = createInitialState();
  document.getElementById('history-tbody').innerHTML = '';
  showScreen('screen-game');
  beginQuarter();
}

/** Set up a new quarter (show news, decision panel, reset rate selector) */
function beginQuarter() {
  state.phase       = 'decision';
  state.pendingRate = state.fedRate;   // default: hold current rate

  renderHeader();
  renderIndicators();
  renderNews();
  renderSparklines();
  renderRateSelector();

  // Show decision panel, hide result panel
  document.getElementById('panel-decision').classList.remove('hidden');
  document.getElementById('panel-result').classList.add('hidden');
}

/** Called when the player clicks "Confirm Decision" */
function makeDecision() {
  if (state.phase !== 'decision') return;
  state.phase = 'result';

  const rateDelta = Math.round((state.pendingRate - state.fedRate) * 100) / 100;
  state.fedRate   = state.pendingRate;

  // Advance economy
  const result = advanceEconomy(rateDelta);

  // Calculate penalty BEFORE updating state (measure conditions this quarter)
  const qPenalty = calcQuarterPenalty(state.inflation, state.unemployment);
  state.cumulativePenalty += qPenalty;

  // Build decision label for history
  let decisionLabel;
  if (Math.abs(rateDelta) < 0.001) {
    decisionLabel = 'Hold';
  } else if (rateDelta > 0) {
    decisionLabel = '▲ +' + fmt(rateDelta) + '%';
  } else {
    decisionLabel = '▼ ' + fmt(rateDelta) + '%';
  }

  const shock = state.shockSchedule[state.quarter - 1];

  // Log history record (conditions AT START of this quarter)
  const record = {
    quarter:      state.quarter,
    inflation:    state.inflation,
    unemployment: state.unemployment,
    rate:         state.fedRate,
    decision:     decisionLabel,
    eventTitle:   shock ? shock.title : null
  };
  state.history.push(record);
  appendHistoryRow(record);

  // Update economy state
  state.inflation    = result.newInflation;
  state.unemployment = result.newUnemployment;
  state.lagInflEffect  = result.nextLagInfl;
  state.lagUnempEffect = result.nextLagUnemp;

  // Render result panel
  renderResult(rateDelta, result.newInflation, result.newUnemployment, qPenalty);
  renderIndicators();
  renderSparklines();
  renderHeader();

  // Show result panel, hide decision panel
  document.getElementById('panel-decision').classList.add('hidden');
  document.getElementById('panel-result').classList.remove('hidden');
}

/** Called when player clicks "Next Quarter" */
function nextQuarter() {
  if (state.phase !== 'result') return;
  if (state.quarter >= TOTAL_QUARTERS) {
    // Game over — show end screen
    renderEndScreen();
    showScreen('screen-end');
    return;
  }

  state.quarter++;
  beginQuarter();
}

/** Reset and return to intro screen */
function resetGame() {
  state = {};
  document.getElementById('history-tbody').innerHTML    = '';
  document.getElementById('end-history-tbody').innerHTML = '';
  // Reset panel visibility for next game
  document.getElementById('panel-decision').classList.remove('hidden');
  document.getElementById('panel-result').classList.add('hidden');
  // Clear sparkline canvases so no artifacts carry over
  ['chart-inflation', 'chart-unemployment', 'chart-rate'].forEach(function(id) {
    var c = document.getElementById(id);
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  });
  showScreen('screen-intro');
}


/* ==========================================================================
   DOM READY — inject rate selector markup into the decision panel
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Build the rate selector HTML inside the decision panel
  const decisionPanel = document.getElementById('panel-decision');
  if (decisionPanel) {
    decisionPanel.innerHTML = `
      <h3 class="panel-title">Set Monetary Policy</h3>
      <p class="decision-prompt">Adjust the federal funds rate, then press <strong>GO</strong> to apply your decision.</p>
      <div class="rate-selector-wrapper">
        <div class="rate-selector-scroll" id="rate-selector-list">
          <!-- Rate options injected by renderRateSelector() -->
        </div>
        <div class="rate-selector-controls">
          <div class="rate-change-summary hold" id="rate-change-summary">Hold steady</div>
          <button class="btn-go" id="btn-go-action">GO &rarr;</button>
        </div>
      </div>
    `;

    // Attach GO button event listener (no inline onclick)
    document.getElementById('btn-go-action').addEventListener('click', makeDecision);
  }

  // Attach event listeners for all game control buttons (no inline onclick)
  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-next').addEventListener('click', nextQuarter);
  document.getElementById('btn-play-again').addEventListener('click', resetGame);
});
