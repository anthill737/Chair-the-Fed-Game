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
// Declared as `let` so difficulty modes can override them at game start.
let RATE_INFL_SENSITIVITY  = 0.18;  // Each 1% rate change → this much inflation impact
let RATE_UNEMP_SENSITIVITY = 0.14;  // Each 1% rate change → this much unemployment impact

// === TUNING: Lag (policy takes time to fully work)
// LAG_IMMEDIATE: fraction of effect felt this quarter
// LAG_DEFERRED:  fraction felt next quarter (should sum to ~1.0)
const LAG_IMMEDIATE = 0.45;
const LAG_DEFERRED  = 0.55;

// === TUNING: Momentum / mean-reversion
// How strongly the economy drifts back toward "normal" each quarter
let INFL_MEAN_REVERT  = 0.08;   // pull toward TARGET_INFLATION
let UNEMP_MEAN_REVERT = 0.07;   // pull toward TARGET_UNEMPLOYMENT

// === TUNING: Random noise magnitude
let INFL_NOISE  = 0.15;   // max random ± on inflation each quarter
let UNEMP_NOISE = 0.12;   // max random ± on unemployment each quarter

// === TUNING: Value bounds (hard clamps)
const INFL_MIN  = -1.0;
const INFL_MAX  = 15.0;
const UNEMP_MIN = 2.0;
const UNEMP_MAX = 15.0;

// === TUNING: Scoring weights and thresholds ===
const INFL_WEIGHT        = 1.0;   // relative importance of inflation in scoring
const UNEMP_WEIGHT       = 1.0;   // relative importance of unemployment in scoring
let MAX_AVG_PENALTY    = 5.0;   // penalty at which score hits 0
let SCORE_EXCELLENT    = 80;
let SCORE_GOOD         = 60;
let SCORE_POOR         = 40;

// Total quarters in the simulation
const TOTAL_QUARTERS = 16;
const START_YEAR     = 2014;

// Graph animation timing is controlled here.
const GRAPH_ANIMATION_MS = 1100;


/* ==========================================================================
   DIFFICULTY SYSTEM
   Three modes that meaningfully change how the economy responds.
   Textbook  = Easy    (forgiving, predictable, more responsive to policy)
   Real World = Default (calibrated to historical Fed experience)
   Crisis Mode = Hard  (volatile, stubborn, Volcker-style brutal)
   ========================================================================== */

const DIFFICULTY_PROFILES = {
  textbook: {
    name:                     'Textbook',
    subtitle:                 'Academic / Easy',
    description:              'Forgiving economy. Good for learning the basics.',
    rateInflSensitivity:      0.24,   // policy more effective at controlling inflation
    rateUnempSensitivity:     0.18,   // policy more effective at influencing employment
    inflNoise:                0.08,   // low randomness — economy behaves predictably
    unempNoise:               0.06,
    inflMeanRevert:           0.12,   // economy corrects toward targets quickly
    unempMeanRevert:          0.10,
    eventChance:              0.20,   // 20% chance of any event per quarter (~3 events/run)
    shockMagnitudeMultiplier: 0.7     // shocks are smaller
  },
  realworld: {
    name:                     'Real World',
    subtitle:                 'Realistic / Default',
    description:              'Calibrated to historical Fed data. The intended experience.',
    rateInflSensitivity:      0.18,
    rateUnempSensitivity:     0.14,
    inflNoise:                0.15,
    unempNoise:               0.12,
    inflMeanRevert:           0.08,
    unempMeanRevert:          0.07,
    eventChance:              0.30,   // 30% chance of any event per quarter (~4-5 events/run)
    shockMagnitudeMultiplier: 1.0
  },
  crisis: {
    name:                     'Crisis Mode',
    subtitle:                 'Volcker-Style Brutal',
    description:              'Volatile economy. Policy lags hurt more. Not for the faint of heart.',
    rateInflSensitivity:      0.13,   // policy less effective — economy resists correction
    rateUnempSensitivity:     0.10,
    inflNoise:                0.25,   // high volatility, frequent surprises
    unempNoise:               0.20,
    inflMeanRevert:           0.04,   // economy barely self-corrects
    unempMeanRevert:          0.03,
    eventChance:              0.40,   // 40% chance of any event per quarter (~6-7 events/run)
    shockMagnitudeMultiplier: 1.5,    // shocks are larger
    initInflation:            4.5,    // economy already running hot at game start
    initUnemployment:         7.0     // economy already strained at game start
  }
};

// Currently active difficulty profile — set by selectDifficulty() on the intro screen.
let currentDifficulty = DIFFICULTY_PROFILES.realworld;

/**
 * Called by difficulty selector buttons on the intro screen.
 * Updates the active profile and refreshes visual selection state.
 */
function selectDifficulty(key) {
  if (!DIFFICULTY_PROFILES[key]) return;
  currentDifficulty = DIFFICULTY_PROFILES[key];
  document.querySelectorAll('.btn-difficulty').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === key);
  });
  const descEl = document.getElementById('difficulty-description');
  if (descEl) descEl.textContent = currentDifficulty.description;
}

/**
 * Apply the active difficulty profile to the global tuning constants.
 * Must be called at the start of each game so advanceEconomy() uses
 * the correct values for the chosen difficulty.
 */
function applyDifficultyToConstants() {
  const d = currentDifficulty;
  RATE_INFL_SENSITIVITY  = d.rateInflSensitivity;
  RATE_UNEMP_SENSITIVITY = d.rateUnempSensitivity;
  INFL_NOISE             = d.inflNoise;
  UNEMP_NOISE            = d.unempNoise;
  INFL_MEAN_REVERT       = d.inflMeanRevert;
  UNEMP_MEAN_REVERT      = d.unempMeanRevert;
}


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
  // ── SUPPLY shocks ─────────────────────────────────────────────────────────
  {
    id: 'oil_spike',
    title: 'Oil Price Spike',
    badge: 'BREAKING',
    tier: 2,
    category: 'supply',
    duration: 2,
    text: 'Global oil prices have surged following supply disruptions in major producing regions. Energy costs for consumers and businesses are rising sharply, pushing up prices across the economy.',
    inflEffect:  0.40,
    unempEffect: 0.25,
    inflLag:     0.20,
    unempLag:    0.10
  },
  {
    id: 'supply_disruption',
    title: 'Supply Chain Disruption',
    badge: 'BREAKING',
    tier: 2,
    category: 'supply',
    duration: 2,
    text: 'Major port congestion and transportation bottlenecks are causing widespread shortages of goods. Delivery times have lengthened and supplier prices are rising, adding to inflationary pressure.',
    inflEffect:  0.45,
    unempEffect: 0.20,
    inflLag:     0.25,
    unempLag:    0.10
  },
  {
    id: 'energy_drop',
    title: 'Energy Price Drop',
    badge: 'UPDATE',
    tier: 1,
    category: 'supply',
    duration: 1,
    text: 'A surge in global energy production has sent oil and natural gas prices sharply lower. Consumers are seeing lower prices at the pump and in utility bills, providing a boost to real incomes.',
    inflEffect: -0.35,
    unempEffect:-0.10,
    inflLag:    -0.15,
    unempLag:    0.00
  },
  {
    id: 'productivity',
    title: 'Productivity Improvement',
    badge: 'UPDATE',
    tier: 1,
    category: 'supply',
    duration: 1,
    text: 'A wave of business efficiency gains — driven largely by technology adoption — is allowing companies to produce more with fewer resources. This is restraining both price and wage growth.',
    inflEffect: -0.25,
    unempEffect:-0.20,
    inflLag:    -0.10,
    unempLag:   -0.10
  },
  {
    id: 'oil_embargo',
    title: 'Oil Supply Embargo',
    badge: 'CRISIS',
    tier: 3,
    category: 'supply',
    duration: 3,
    text: 'A major oil-producing bloc has announced a coordinated export embargo targeting Western nations. Fuel prices are spiking across the board and energy rationing is being discussed in several states.',
    inflEffect:  0.60,
    unempEffect: 0.35,
    inflLag:     0.30,
    unempLag:    0.15
  },
  // ── DEMAND shocks ─────────────────────────────────────────────────────────
  {
    id: 'spending_slowdown',
    title: 'Consumer Spending Slowdown',
    badge: 'BREAKING',
    tier: 2,
    category: 'demand',
    duration: 1,
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
    tier: 2,
    category: 'demand',
    duration: 2,
    text: 'Home prices and construction activity are at multi-year highs. Strong demand for housing is spilling over into consumer confidence and broader spending, adding to inflationary pressure.',
    inflEffect:  0.30,
    unempEffect:-0.20,
    inflLag:     0.15,
    unempLag:   -0.10
  },
  {
    id: 'fiscal_stimulus',
    title: 'Fiscal Stimulus Package',
    badge: 'BREAKING',
    tier: 2,
    category: 'demand',
    duration: 2,
    text: 'Congress has passed a significant fiscal stimulus bill. Direct payments to households and infrastructure spending are expected to boost demand substantially over the coming quarters.',
    inflEffect:  0.30,
    unempEffect:-0.30,
    inflLag:     0.15,
    unempLag:   -0.15
  },
  {
    id: 'consumer_confidence',
    title: 'Consumer Confidence Surge',
    badge: 'UPDATE',
    tier: 1,
    category: 'demand',
    duration: 1,
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
    tier: 1,
    category: 'demand',
    duration: 1,
    text: 'Congress has reached a deficit reduction agreement that includes significant cuts to federal spending. The resulting fiscal drag is expected to weigh on economic activity over coming quarters.',
    inflEffect: -0.20,
    unempEffect: 0.30,
    inflLag:    -0.10,
    unempLag:    0.15
  },
  {
    id: 'wage_price_spiral',
    title: 'Wage-Price Spiral',
    badge: 'CRISIS',
    tier: 3,
    category: 'demand',
    duration: 3,
    text: 'Surging labor costs are feeding directly into consumer prices, which are in turn fueling demands for even higher wages. The feedback loop is accelerating — breaking it will require decisive policy action.',
    inflEffect:  0.55,
    unempEffect:-0.15,
    inflLag:     0.30,
    unempLag:   -0.05
  },
  // ── FINANCIAL shocks ──────────────────────────────────────────────────────
  {
    id: 'financial_stress',
    title: 'Financial Market Stress',
    badge: 'BREAKING',
    tier: 2,
    category: 'financial',
    duration: 1,
    text: 'Volatility in financial markets has tightened credit conditions significantly. Banks have pulled back on lending to consumers and businesses, threatening to slow economic growth.',
    inflEffect: -0.20,
    unempEffect: 0.45,
    inflLag:    -0.10,
    unempLag:    0.20
  },
  {
    id: 'banking_stress',
    title: 'Banking Sector Stress',
    badge: 'BREAKING',
    tier: 2,
    category: 'financial',
    duration: 1,
    text: 'Several regional banks are reporting significant losses. The resulting tightening of credit standards is damping investment and consumer spending, raising recession concerns.',
    inflEffect: -0.15,
    unempEffect: 0.40,
    inflLag:    -0.10,
    unempLag:    0.15
  },
  {
    id: 'banking_crisis',
    title: 'Banking System Crisis',
    badge: 'CRISIS',
    tier: 3,
    category: 'financial',
    duration: 3,
    text: 'Multiple large financial institutions are reporting severe balance-sheet stress. Interbank lending has seized up, credit is unavailable at nearly any price, and emergency Fed liquidity facilities are being activated.',
    inflEffect: -0.35,
    unempEffect: 0.70,
    inflLag:    -0.20,
    unempLag:    0.35
  },
  // ── POLITICAL shocks ──────────────────────────────────────────────────────
  {
    id: 'import_prices',
    title: 'Import Price Increase',
    badge: 'UPDATE',
    tier: 1,
    category: 'demand',
    duration: 1,
    text: 'New tariffs and a weaker dollar are raising the cost of imported goods. Businesses are beginning to pass these higher costs on to consumers, adding upward pressure to inflation.',
    inflEffect:  0.30,
    unempEffect: 0.10,
    inflLag:     0.15,
    unempLag:    0.05
  },
  {
    id: 'strong_dollar',
    title: 'Stronger Dollar',
    badge: 'UPDATE',
    tier: 1,
    category: 'demand',
    duration: 1,
    text: 'The U.S. dollar has strengthened significantly against major currencies. This is holding down import prices, providing relief on inflation, but American exporters are facing a competitive headwind.',
    inflEffect: -0.30,
    unempEffect: 0.15,
    inflLag:    -0.15,
    unempLag:    0.05
  },
  {
    id: 'political_pressure',
    title: 'Congressional Pressure on Fed',
    badge: 'BREAKING',
    tier: 2,
    category: 'political',
    duration: 2,
    text: 'Senate hearings are targeting the Fed\'s independence. Lawmakers are publicly demanding lower rates to boost employment ahead of elections. Markets are pricing in policy uncertainty, and the Fed\'s credibility is being tested.',
    inflEffect:  0.20,
    unempEffect:-0.05,
    inflLag:     0.15,
    unempLag:    0.00
  },
  // ── GLOBAL shocks ─────────────────────────────────────────────────────────
  {
    id: 'global_slowdown',
    title: 'Global Economic Slowdown',
    badge: 'BREAKING',
    tier: 2,
    category: 'global',
    duration: 1,
    text: 'Growth is decelerating sharply in major trading partners. Weakening overseas demand is hitting U.S. exports, and business investment plans are being scaled back.',
    inflEffect: -0.30,
    unempEffect: 0.35,
    inflLag:    -0.15,
    unempLag:    0.15
  },
  {
    id: 'global_recession',
    title: 'Global Recession',
    badge: 'CRISIS',
    tier: 3,
    category: 'global',
    duration: 3,
    text: 'The world\'s largest economies have simultaneously tipped into contraction. Global trade volumes are collapsing, commodity prices are plummeting, and the IMF has issued an emergency coordinated response call. The U.S. cannot escape the downdraft.',
    inflEffect: -0.50,
    unempEffect: 0.65,
    inflLag:    -0.25,
    unempLag:    0.30
  },
  // ── OTHER ─────────────────────────────────────────────────────────────────
  {
    id: 'wage_surge',
    title: 'Wage Growth Acceleration',
    badge: 'UPDATE',
    tier: 1,
    category: 'supply',
    duration: 1,
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
    tier: 1,
    category: 'demand',
    duration: 1,
    text: 'Investment and hiring in the technology sector are accelerating. Tech companies are absorbing a large share of the workforce, pushing down headline unemployment while keeping a lid on goods prices.',
    inflEffect:  0.10,
    unempEffect:-0.30,
    inflLag:     0.05,
    unempLag:   -0.10
  },
  {
    id: 'inflation_spike',
    title: 'Domestic Inflation Spike',
    badge: 'CRISIS',
    tier: 3,
    category: 'demand',
    duration: 2,
    text: 'A sudden acceleration in broad-based consumer prices has caught markets off guard. Shelter, food, and services are all rising faster than expected. Inflation expectations are becoming unanchored — a dangerous sign.',
    inflEffect:  0.50,
    unempEffect: 0.05,
    inflLag:     0.25,
    unempLag:    0.05
  },
  // ── POSITIVE supply / structural shocks ────────────────────────────────────
  {
    id: 'trade_deal',
    title: 'Major Trade Agreement Reached',
    badge: 'UPDATE',
    tier: 1,
    category: 'global',
    duration: 2,
    text: 'A landmark trade agreement with key trading partners has eliminated tariffs on a wide range of goods. Cheaper imports are pulling down consumer prices while new export markets are opening up hiring across manufacturing and agriculture.',
    inflEffect: -0.30,
    unempEffect:-0.30,
    inflLag:    -0.15,
    unempLag:   -0.15
  },
  {
    id: 'reshoring_boom',
    title: 'Manufacturing Reshoring Wave',
    badge: 'UPDATE',
    tier: 1,
    category: 'supply',
    duration: 2,
    text: 'A surge of domestic factory investment is bringing production back to the United States. Companies are hiring rapidly across the industrial heartland, pushing unemployment lower, while competition is keeping a lid on goods prices.',
    inflEffect: -0.10,
    unempEffect:-0.40,
    inflLag:     0.05,
    unempLag:   -0.20
  },
  {
    id: 'food_prices_drop',
    title: 'Global Food Price Decline',
    badge: 'UPDATE',
    tier: 1,
    category: 'supply',
    duration: 1,
    text: 'Bumper harvests worldwide and improved agricultural logistics have sent food commodity prices sharply lower. Grocery store prices are falling for the first time in years, providing direct relief to household budgets.',
    inflEffect: -0.35,
    unempEffect:-0.05,
    inflLag:    -0.15,
    unempLag:    0.00
  },
  {
    id: 'hiring_boom',
    title: 'Sector Hiring Boom',
    badge: 'BOOM',
    tier: 1,
    category: 'labor',
    duration: 2,
    text: 'A major expansion across construction, clean energy, and infrastructure is driving rapid job creation. Unemployment is falling sharply as firms compete aggressively for workers. Rising wage pressures add a mild inflationary undertone — a tricky balance for the Fed.',
    inflEffect:   0.15,
    unempEffect: -0.40,
    inflLag:      0.05,
    unempLag:    -0.15
  },
  {
    id: 'ai_productivity_surge',
    title: 'Technology Productivity Surge',
    badge: 'BOOM',
    tier: 1,
    category: 'supply',
    duration: 2,
    text: 'A broad wave of automation and AI adoption is dramatically boosting output across sectors. Firms are producing more with the same workforce, easing cost pressures and lifting real wages simultaneously. Policymakers must decide how much to accommodate the expansion.',
    inflEffect:  -0.35,
    unempEffect: -0.25,
    inflLag:     -0.15,
    unempLag:    -0.10
  }
];

// Routine news headlines -- organized by economic mood for state-reactive selection.
// === TUNING: Routine news headlines ===
// selectRoutineNews(state) picks the right bucket based on inflation/unemployment gaps.
const ROUTINE_NEWS = {
  onTarget: [
    "Economic data came in broadly as expected. Inflation and unemployment remain near their targets, giving the Fed room to stay patient.",
    "Markets hold their breath as the Fed meets -- no surprises expected given steady economic conditions.",
    "Analysts praise the Fed's steady hand as the economy tracks closely to its dual mandate targets.",
    "Goldilocks conditions persist: inflation near 2%, unemployment near its natural rate.",
    "No surprises this quarter: consumer spending, employment, and prices all moved within expected ranges."
  ],
  inflationHigh: [
    "Consumers feel the pinch of rising prices as inflation continues to run above the Fed's 2% target.",
    "Fed under fire: Wall Street demands action as inflation proves stickier than expected.",
    "The Fed faces mounting pressure to tighten as price growth outpaces wages for another quarter.",
    "Cost-of-living squeeze deepens -- housing, food, and energy all posting above-target gains.",
    "Bond markets signal rate-hike expectations as inflation shows no sign of retreating to target.",
    "We cannot wait forever, warn economists as inflation overshoots for the third straight quarter."
  ],
  unemploymentHigh: [
    "Job market stalls as hiring slows for the second consecutive quarter, raising recession alarm bells.",
    "Workers left behind: unemployment climbs as businesses pull back on investment.",
    "The human cost of inaction, economists warn, as unemployment drifts further from its natural rate.",
    "Layoffs spread across manufacturing and retail -- the Fed faces calls to ease policy.",
    "Weak payroll numbers fuel debate over whether the Fed has been too tight for too long.",
    "Consumers tighten belts as job insecurity rises -- confidence surveys hit a multi-quarter low."
  ],
  stagflation: [
    "Policy nightmare: the Fed faces rising prices AND rising unemployment at the same time.",
    "Stagflation fears return to mainstream discourse as both inflation and joblessness climb.",
    "There are no good options here, Fed officials acknowledge as the dual mandate pulls in opposite directions.",
    "Economists divided: some call for hikes to kill inflation, others warn that would crush the job market.",
    "The 1970s are on everyone's mind as price pressures and weak labor markets intensify simultaneously."
  ],
  softLanding: [
    "A soft landing looks achievable -- inflation cooling without triggering a spike in unemployment.",
    "The Fed has managed this masterfully so far, say analysts as conditions improve across both mandates.",
    "Wall Street optimism grows as disinflation takes hold without significant job losses.",
    "Rare good news on all fronts: prices cooling, labor market solid, growth holding up.",
    "Policy is working as intended -- the question now is whether the Fed can maintain the balance."
  ]
};

/* ==========================================================================
   DYNAMIC NEWS + ADVISORS SYSTEM
   State-reactive headline selection, shock sub-headlines, reaction lines,
   and advisor recommendations that make each turn feel distinct and human.
   ========================================================================== */

/**
 * Select a ROUTINE_NEWS entry based on current economic conditions.
 * @param {object} s - game state
 * @returns {{ text: string, mood: string }}
 */
function selectRoutineNews(s) {
  var inflGap  = s.inflation   - TARGET_INFLATION;
  var unempGap = s.unemployment - TARGET_UNEMPLOYMENT;
  var pool, mood;
  if (inflGap > 0.8 && unempGap > 0.8) {
    pool = ROUTINE_NEWS.stagflation; mood = 'crisis';
  } else if (Math.abs(inflGap) < 0.4 && unempGap < -0.2) {
    pool = ROUTINE_NEWS.softLanding; mood = 'optimistic';
  } else if (Math.abs(inflGap) < 0.4 && Math.abs(unempGap) < 0.4) {
    pool = ROUTINE_NEWS.onTarget; mood = 'stable';
  } else if (inflGap > 0.5) {
    pool = ROUTINE_NEWS.inflationHigh; mood = 'warning';
  } else if (unempGap > 0.5) {
    pool = ROUTINE_NEWS.unemploymentHigh; mood = 'warning';
  } else {
    pool = ROUTINE_NEWS.onTarget; mood = 'stable';
  }
  return { text: pool[s.quarter % pool.length], mood: mood };
}

/**
 * Generate a contextual sub-headline for a shock event.
 * @param {object} shock
 * @param {object} s - game state
 * @returns {string}
 */
function getShockSubHeadline(shock, s) {
  var inflGap  = s.inflation   - TARGET_INFLATION;
  var unempGap = s.unemployment - TARGET_UNEMPLOYMENT;
  if (inflGap > 1.5 && shock.inflEffect > 0) {
    return 'Analysts alarmed: another inflation shock compounds an already difficult situation for the Fed.';
  }
  if (unempGap > 1.5 && shock.unempEffect > 0) {
    return 'Economists fear a feedback loop as this shock hits an already weakening labor market.';
  }
  var cat = (shock.category || 'default');
  if (cat === 'supply')    return 'Analysts divided on how aggressively the Fed should respond to the supply-side disruption.';
  if (cat === 'demand')    return 'Markets watch closely as demand conditions shift -- rate expectations are being repriced.';
  if (cat === 'financial') return 'Volatility spikes as financial markets digest the implications for Fed policy.';
  if (cat === 'external')  return 'Global spillovers complicate the Fed calculus -- a wait-and-see response is expected.';
  if (cat === 'political') return 'The Fed independence is in the spotlight as political pressure intensifies.';
  return 'Markets await guidance from the Fed on how this development will influence its next move.';
}

/**
 * Generate a reaction headline based on the last player decision.
 * @param {object} s - game state
 * @returns {string|null}
 */
function getReactionHeadline(s) {
  if (!s.history || s.history.length === 0) return null;
  var last = s.history[s.history.length - 1];
  var d = last.decision || '';
  var q = s.quarter;
  if (d.toLowerCase().indexOf('raise') !== -1) {
    var hi = [
      "Markets brace after the Fed's rate hike -- mortgage costs rise, equities dip.",
      "Dollar strengthens on tighter policy; export-dependent sectors feel the squeeze.",
      "Rate hike sends a hawkish signal -- bond yields move higher in response."
    ];
    return hi[q % hi.length];
  }
  if (d.toLowerCase().indexOf('lower') !== -1) {
    var cu = [
      "Markets rally after the Fed eases -- risk appetite returns across sectors.",
      "Rate cut sparks homebuyer optimism as borrowing costs fall.",
      "Dovish pivot welcomed by equity markets; dollar softens on the news."
    ];
    return cu[q % cu.length];
  }
  if (d === 'Hold') {
    var ho = [
      "Fed holds steady -- patient approach leaves both hawks and doves unsatisfied.",
      "No change from the Fed this quarter; markets interpret the pause as data-dependent.",
      "Wait and watch remains the Fed's posture as it holds rates unchanged."
    ];
    return ho[q % ho.length];
  }
  return null;
}

/* -- ADVISORS -------------------------------------------------------------- */

const ADVISORS = [
  { name: 'Dr. Chen',    title: 'Chief Economist',  style: 'hawkish',     avatar: 'C' },
  { name: 'Gov. Rivera', title: 'Board Governor',   style: 'dovish',      avatar: 'R' },
  { name: 'Sec. Park',   title: 'Market Analyst',   style: 'data-driven', avatar: 'P' }
];

/**
 * Generate advisor recommendations based on current game state.
 * @param {object} s - game state
 * @returns {Array}
 */
function generateAdvisorRecommendations(s) {
  var inflGap  = s.inflation   - TARGET_INFLATION;
  var unempGap = s.unemployment - TARGET_UNEMPLOYMENT;
  var shock    = s.shockSchedule ? s.shockSchedule[s.quarter - 1] : null;

  return ADVISORS.map(function(advisor) {
    var action, amount, rationale, urgency;

    if (advisor.style === 'hawkish') {
      if (inflGap > 1.5) {
        action = 'raise'; amount = 0.50; urgency = 'alarmed';
        rationale = 'With inflation at ' + s.inflation.toFixed(1) + '%, every quarter of delay makes this harder to unwind. We need to move decisively.';
      } else if (inflGap > 0.5) {
        action = 'raise'; amount = 0.25; urgency = 'concerned';
        rationale = 'Inflation is ' + s.inflation.toFixed(1) + '% -- above target. A modest hike now prevents a much harder correction later.';
      } else if (inflGap > -0.3) {
        action = 'hold'; amount = 0; urgency = 'calm';
        rationale = 'Inflation is near target at ' + s.inflation.toFixed(1) + '%. Hold for now, but watching closely for any upward drift.';
      } else {
        action = 'hold'; amount = 0; urgency = 'calm';
        rationale = 'Inflation is soft at ' + s.inflation.toFixed(1) + '%, but I would resist cutting -- let conditions stabilize first.';
      }
    } else if (advisor.style === 'dovish') {
      if (unempGap > 1.5) {
        action = 'lower'; amount = 0.50; urgency = 'alarmed';
        rationale = 'Unemployment at ' + s.unemployment.toFixed(1) + '% is inflicting real harm on workers. We cannot afford gradualism here.';
      } else if (unempGap > 0.5) {
        action = 'lower'; amount = 0.25; urgency = 'concerned';
        rationale = 'Labor markets remain soft at ' + s.unemployment.toFixed(1) + '%. A rate cut supports jobs without meaningfully stoking prices.';
      } else if (unempGap > -0.5) {
        action = 'hold'; amount = 0; urgency = 'calm';
        rationale = 'Employment is near target. Hold -- the recovery is fragile and premature tightening would be a mistake.';
      } else {
        action = 'hold'; amount = 0; urgency = 'calm';
        rationale = 'Unemployment is low at ' + s.unemployment.toFixed(1) + '%. Labor markets look healthy -- hold and let the expansion continue.';
      }
    } else {
      var shockNote = shock ? ' The ' + shock.title.toLowerCase() + ' adds uncertainty.' : '';
      if (inflGap > 1.0 && unempGap < 0.5) {
        action = 'raise'; amount = 0.25; urgency = 'concerned';
        rationale = 'Inflation at ' + s.inflation.toFixed(1) + '% with unemployment at ' + s.unemployment.toFixed(1) + '% -- the data supports a measured hike.' + shockNote;
      } else if (unempGap > 1.0 && inflGap < 0.5) {
        action = 'lower'; amount = 0.25; urgency = 'concerned';
        rationale = 'Unemployment at ' + s.unemployment.toFixed(1) + '% with inflation contained at ' + s.inflation.toFixed(1) + '%. A modest cut is warranted.' + shockNote;
      } else if (inflGap > 0.5 && unempGap > 0.5) {
        action = 'hold'; amount = 0; urgency = 'concerned';
        rationale = 'Stagflationary pressures complicate the picture -- inflation ' + s.inflation.toFixed(1) + '%, unemployment ' + s.unemployment.toFixed(1) + '%. Hold and gather more data.' + shockNote;
      } else {
        action = 'hold'; amount = 0; urgency = 'calm';
        rationale = 'Both mandates look balanced -- inflation ' + s.inflation.toFixed(1) + '%, unemployment ' + s.unemployment.toFixed(1) + '%. Patient policy is appropriate.' + shockNote;
      }
    }

    return { advisor: advisor, action: action, amount: amount, rationale: rationale, urgency: urgency };
  });
}

/** Render the advisor briefing panel. Called from beginQuarter() each turn. */
function renderAdvisors() {
  var container = document.getElementById('advisors-list');
  if (!container) return;
  var recs = generateAdvisorRecommendations(state);
  container.innerHTML = recs.map(function(rec) {
    var lbl = rec.action === 'raise'
      ? (rec.amount > 0 ? '+' + fmt(rec.amount) + '%' : 'Raise')
      : rec.action === 'lower'
      ? (rec.amount > 0 ? '-' + fmt(rec.amount) + '%' : 'Cut')
      : 'Hold';
    var ac = rec.action === 'raise' ? 'advisor-rec--raise'
           : rec.action === 'lower' ? 'advisor-rec--cut'
           : 'advisor-rec--hold';
    return '<div class="advisor-card advisor-card--' + rec.urgency + '">'
      + '<div class="advisor-avatar">' + rec.advisor.avatar + '</div>'
      + '<div class="advisor-content">'
      + '<div class="advisor-header-row">'
      + '<span class="advisor-name">' + rec.advisor.name + '</span>'
      + '<span class="advisor-title-text">' + rec.advisor.title + '</span>'
      + '<span class="advisor-rec ' + ac + '">' + lbl + '</span>'
      + '</div>'
      + '<div class="advisor-rationale">' + rec.rationale + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}


/* ==========================================================================
   3. GAME STATE
   Single source of truth for all runtime data.
   ========================================================================== */
let state = {};

function createInitialState(seed) {
  // Apply the selected difficulty profile to global tuning constants.
  applyDifficultyToConstants();

  const d   = currentDifficulty;
  const mag = d.shockMagnitudeMultiplier;

  // Build probabilistic schedule using this difficulty's per-quarter event chance,
  // then scale each event's magnitudes for the active difficulty.
  const schedule = buildShockSchedule(seed, d.eventChance).map(entry =>
    entry == null ? null : {
      ...entry,
      inflEffect:  entry.inflEffect  * mag,
      unempEffect: entry.unempEffect * mag,
      inflLag:     (entry.inflLag  || 0) * mag,
      unempLag:    (entry.unempLag || 0) * mag
    }
  );

  // Use difficulty-specific starting conditions if defined
  const initInflation    = d.initInflation    != null ? d.initInflation    : INIT_INFLATION;
  const initUnemployment = d.initUnemployment != null ? d.initUnemployment : INIT_UNEMPLOYMENT;

  return {
    quarter:                   1,
    inflation:                 initInflation,
    unemployment:              initUnemployment,
    fedRate:                   INIT_RATE,
    pendingRate:               INIT_RATE,   // rate player has selected but not yet confirmed
    lagInflEffect:             0,           // deferred inflation effect from last decision
    lagUnempEffect:            0,           // deferred unemployment effect from last quarter
    history:                   [],          // array of completed-quarter records
    shockSchedule:             schedule,    // array[16] of shock or null, scaled for difficulty
    cumulativePenalty:         0,
    phase:                     'decision',  // 'decision' | 'animating' | 'result'
    sparklineAnimation:        null,
    animationFrameId:          0,
    // Multi-turn shock tracking
    activeShock:               null,        // shock object currently in effect (or null)
    activeShockTurnsRemaining: 0,           // quarters left for the active shock (0 = none)
    // Runtime cooldown counter — mirrors schedule-generation cooldown for advanceEconomy
    eventCooldownQuarters:     0,
    seed:                      seed != null ? seed : null
  };
}

// Simple LCG seeded PRNG — returns a function that yields values in [0, 1)
function seededRandom(seed) {
  let s = seed >>> 0;
  return function() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Build a probabilistic shock schedule for a 16-quarter game.
// Pass an integer seed for deterministic (seeded) runs; omit for random.
// eventChance: probability (0–1) that any given quarter has an event.
// Tier distribution when an event fires: ~65% tier-1, ~27% tier-2, ~8% tier-3.
// After a tier-3 event, a 2-quarter cooldown prevents back-to-back major shocks.
function buildShockSchedule(seed, eventChance) {
  const rng = (seed != null) ? seededRandom(seed) : Math.random.bind(Math);
  const chance = (eventChance != null) ? eventChance : 0.30;

  // Fisher-Yates shuffle using rng — used to randomise each tier pool
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Pre-shuffle each tier pool so we cycle through them without repetition
  let tier1Pool = shuffle(SHOCK_EVENTS.filter(e => e.tier === 1));
  let tier2Pool = shuffle(SHOCK_EVENTS.filter(e => e.tier === 2));
  let tier3Pool = shuffle(SHOCK_EVENTS.filter(e => e.tier === 3));
  let t1Idx = 0, t2Idx = 0, t3Idx = 0;

  function pickFromTier(pool, idx) {
    if (pool.length === 0) return null;
    // Wrap around when pool is exhausted (re-shuffle for variety)
    if (idx >= pool.length) {
      pool = shuffle(pool); idx = 0;
    }
    return pool[idx];
  }

  function pickEvent() {
    const roll = rng();
    if (roll < 0.65) {
      // Tier 1 (minor) — ~65%
      const ev = pickFromTier(tier1Pool, t1Idx);
      t1Idx = (t1Idx + 1) % Math.max(1, tier1Pool.length);
      return ev;
    } else if (roll < 0.92) {
      // Tier 2 (moderate) — ~27%
      const ev = pickFromTier(tier2Pool, t2Idx);
      t2Idx = (t2Idx + 1) % Math.max(1, tier2Pool.length);
      return ev;
    } else {
      // Tier 3 (major) — ~8%
      const ev = pickFromTier(tier3Pool, t3Idx);
      t3Idx = (t3Idx + 1) % Math.max(1, tier3Pool.length);
      return ev;
    }
  }

  const slots = new Array(TOTAL_QUARTERS).fill(null);
  let cooldown = 0; // quarters remaining in post-major-event cooldown

  for (let i = 0; i < TOTAL_QUARTERS; i++) {
    if (cooldown > 0) {
      // Cooldown active after a tier-3 event — no event this quarter
      cooldown--;
      slots[i] = null;
      continue;
    }
    if (rng() < chance) {
      const ev = pickEvent();
      slots[i] = ev;
      // Trigger cooldown after a major (tier-3) event
      if (ev && ev.tier === 3) {
        cooldown = 2;
      }
    }
  }

  return slots;
}

function interpolateValue(start, end, progress) {
  return start + (end - start) * progress;
}

function easeSparklineProgress(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function stopSparklineAnimation() {
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = 0;
  }
  if (state.sparklineAnimation) {
    state.sparklineAnimation = null;
  }
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
  // --- Decrement post-major-event cooldown at the start of each quarter ---
  if (state.eventCooldownQuarters > 0) {
    state.eventCooldownQuarters = Math.max(0, state.eventCooldownQuarters - 1);
  }

  // --- Determine the shock in effect this quarter ---
  // Priority: a continuing multi-turn shock takes precedence over scheduling a new one.
  // If no active shock is continuing, check whether the schedule fires a new shock.
  let shock;
  let newActiveShock               = null;
  let newActiveShockTurnsRemaining = 0;

  if (state.activeShockTurnsRemaining > 0 && state.activeShock) {
    // Carry the existing multi-turn shock forward
    shock = state.activeShock;
    newActiveShock               = (state.activeShockTurnsRemaining - 1 > 0) ? state.activeShock : null;
    newActiveShockTurnsRemaining = Math.max(0, state.activeShockTurnsRemaining - 1);
  } else {
    // Check if a new shock fires this quarter from the schedule
    const scheduledShock = state.shockSchedule[state.quarter - 1];
    if (scheduledShock) {
      shock = scheduledShock;
      const dur = scheduledShock.duration || 1;
      if (dur > 1) {
        // Will persist into future quarters
        newActiveShock               = scheduledShock;
        newActiveShockTurnsRemaining = dur - 1;
      }
    } else {
      shock = null;
    }
  }

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

  // --- Random noise (seeded when replaying a seed, random otherwise) ---
  const _rng = (state.noiseRng || Math.random.bind(Math));
  const noiseInfl  = (_rng() * 2 - 1) * INFL_NOISE;
  const noiseUnemp = (_rng() * 2 - 1) * UNEMP_NOISE;

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

  // Persist multi-turn shock state directly into state (so makeDecision doesn't need changes)
  state.activeShock               = newActiveShock;
  state.activeShockTurnsRemaining = newActiveShockTurnsRemaining;

  // After a major (tier-3) shock fires for the first time, set runtime cooldown.
  // This mirrors the schedule-generation cooldown and prevents unscheduled stacking.
  if (shock && shock.tier === 3 && newActiveShockTurnsRemaining === (shock.duration || 1) - 1) {
    state.eventCooldownQuarters = 2;
  }

  return { newInflation, newUnemployment, inflDelta, unempDelta,
           nextLagInfl, nextLagUnemp, shock };
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
 * Calculate a detailed score breakdown across four dimensions (0-100 each).
 * @param {Array} history  state.history array of completed-quarter records
 * @returns {{ inflScore, unempScore, consistencyScore, crisisScore }}
 */
function calcScoreBreakdown(history) {
  const n = history.length;
  if (n === 0) return { inflScore: 0, unempScore: 0, consistencyScore: 0, crisisScore: 0 };

  // 1. Inflation Control
  const avgInflDev = history.reduce((s, r) => s + Math.abs(r.inflation - TARGET_INFLATION), 0) / n;
  const inflScore = Math.max(0, Math.round(100 - (avgInflDev / 3.0) * 100));

  // 2. Employment Stability
  const avgUnempDev = history.reduce((s, r) => s + Math.abs(r.unemployment - TARGET_UNEMPLOYMENT), 0) / n;
  const unempScore = Math.max(0, Math.round(100 - (avgUnempDev / 3.0) * 100));

  // 3. Policy Consistency — penalize large quarter-to-quarter rate swings
  let totalSwing = 0;
  for (let i = 1; i < n; i++) totalSwing += Math.abs(history[i].rate - history[i - 1].rate);
  const avgSwing = n > 1 ? totalSwing / (n - 1) : 0;
  const consistencyScore = Math.max(0, Math.round(100 - (avgSwing / 1.5) * 100));

  // 4. Crisis Handling — performance during shock quarters
  const shockRecs = history.filter(r => r.eventTitle);
  let crisisScore;
  if (shockRecs.length === 0) {
    crisisScore = 100;
  } else {
    const avgShockPenalty = shockRecs.reduce(
      (s, r) => s + Math.abs(r.inflation - TARGET_INFLATION) + Math.abs(r.unemployment - TARGET_UNEMPLOYMENT), 0
    ) / shockRecs.length;
    crisisScore = Math.max(0, Math.round(100 - (avgShockPenalty / 5.0) * 100));
  }

  return { inflScore, unempScore, consistencyScore, crisisScore };
}

/**
 * Returns true if the soft-landing condition is met:
 * the last 4 quarters averaged inflation within 0.5% of target AND unemployment within 0.5% of target.
 */
function getSoftLandingStatus(history) {
  const tail = history.slice(-4);
  if (tail.length < 4) return false;
  const avgInfl  = tail.reduce((s, r) => s + r.inflation,    0) / tail.length;
  const avgUnemp = tail.reduce((s, r) => s + r.unemployment, 0) / tail.length;
  return Math.abs(avgInfl - TARGET_INFLATION) <= 0.5 && Math.abs(avgUnemp - TARGET_UNEMPLOYMENT) <= 0.5;
}

/**
 * Returns the best and worst quarter records from history by combined target deviation.
 */
function getBestWorstQuarters(history) {
  if (history.length === 0) return { best: null, worst: null };
  const withPenalty = history.map(r => ({
    ...r,
    penalty: Math.abs(r.inflation - TARGET_INFLATION) + Math.abs(r.unemployment - TARGET_UNEMPLOYMENT)
  }));
  withPenalty.sort((a, b) => a.penalty - b.penalty);
  return { best: withPenalty[0], worst: withPenalty[withPenalty.length - 1] };
}

/**
 * Returns a one-line shareable result string.
 */
function getEndScreenShareText(score, verdict) {
  return 'I scored ' + score + '/100 as "' + verdict.title + '" on Chair the Fed! Can you do better?';
}

/**
 * Return the reappointment verdict object for a given score.
 * 8 tiers: Legendary Chair (95+) → Worst Chair in Fed History (0-14).
 */
function getVerdict(score) {
  if (score >= 95) {
    return {
      cssClass: 'excellent',
      title: 'Legendary Chair',
      subtitle: 'A Flawless Soft Landing',
      text: 'History will remember you as one of the great Chairs. Inflation and unemployment ' +
            'stayed close to target through shocks, reversals, and relentless uncertainty. ' +
            'The FOMC unanimously endorsed your reappointment — and economists are already writing ' +
            'chapters about your tenure. You made it look easy. It was not.'
    };
  }
  if (score >= 85) {
    return {
      cssClass: 'excellent',
      title: 'Soft Landing Achieved',
      subtitle: 'Textbook Policy',
      text: 'The Federal Open Market Committee has voted unanimously to recommend your reappointment. ' +
            'You successfully navigated the economy through a challenging period, keeping both inflation ' +
            'and unemployment close to their targets. Your steady hand and sound judgment have earned ' +
            'the confidence of the Committee and the public.'
    };
  }
  if (score >= 75) {
    return {
      cssClass: 'good',
      title: 'Steady Hand',
      subtitle: 'Economy Stabilized',
      text: 'The Senate has confirmed your reappointment with broad support. The economy drifted ' +
            'at times, but your consistent and measured approach helped it find its footing. ' +
            'The Committee noted that tighter conditions tested your resolve — and you held the line ' +
            'when it mattered.'
    };
  }
  if (score >= 60) {
    return {
      cssClass: 'good',
      title: 'Reappointed',
      subtitle: 'Mixed but Acceptable',
      text: 'The Senate has confirmed you for another term as Federal Reserve Chair. ' +
            'While there were periods when the economy drifted from its targets, your overall management ' +
            'of monetary policy was sound. The Committee acknowledged the difficult conditions you faced ' +
            'and expressed confidence in your continued leadership.'
    };
  }
  if (score >= 40) {
    return {
      cssClass: 'poor',
      title: 'Not Reappointed',
      subtitle: 'Policy Fell Short',
      text: 'The President has nominated a new Chair of the Federal Reserve. ' +
            'Inflation and unemployment strayed too far from their targets during your tenure. ' +
            'Economists and policymakers have questioned whether your rate decisions responded ' +
            'quickly enough to changing economic conditions. Your term ends without a second appointment.'
    };
  }
  if (score >= 20) {
    return {
      cssClass: 'fired',
      title: 'Policy Disaster',
      subtitle: 'Stagflation Spiral',
      text: 'Congress has passed a resolution calling for your removal, and the President has acted on it. ' +
            'Inflation and unemployment swung well outside acceptable ranges on your watch. ' +
            'Your rate decisions — too aggressive, too timid, or simply mistimed — left lasting scars ' +
            'on the economy. Your term will be a cautionary tale in economic policy courses for decades.'
    };
  }
  if (score >= 15) {
    return {
      cssClass: 'fired',
      title: 'Volcker-Level Crisis',
      subtitle: 'Self-Inflicted',
      text: 'The President has demanded your resignation. Your rate decisions — wildly inconsistent or ' +
            'severely mistimed — sent both inflation and unemployment spiraling into crisis territory. ' +
            'Markets lost confidence. The public lost patience. Historians will debate which quarter was ' +
            'the most damaging. There are several candidates.'
    };
  }
  return {
    cssClass: 'fired',
    title: 'Worst Chair in Fed History',
    subtitle: 'Economic Catastrophe on Your Watch',
    text: 'Congress has passed a resolution calling for your removal, and the President has acted on it. ' +
          'Your management of monetary policy was judged to have caused catastrophic harm to the economy. ' +
          'Both inflation and unemployment reached levels not seen in generations. ' +
          'This outcome will be studied in economics courses for years to come — as a warning.'
  };
}


/* ==========================================================================
   6. RENDERING / UI
   All DOM manipulation and canvas drawing lives here.
   ========================================================================== */

/** Toggle between named screens */
function showScreen(id, scrollTarget) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  var target = document.getElementById(id);
  target.classList.add('active');
  target.scrollTop = 0;  // reset any per-screen scroll position
  // Remove scroll lock first so window.scrollTo actually works
  document.documentElement.classList.toggle('game-screen-active', id === 'screen-game');
  // Scroll after layout settles
  requestAnimationFrame(() => {
    if (scrollTarget) {
      const el = document.getElementById(scrollTarget);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    }
    window.scrollTo(0, 0);
  });
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

/** Update the three economic indicators and their status tags */
function renderIndicators() {
  const inflEl   = document.getElementById('val-inflation');
  const unempEl  = document.getElementById('val-unemployment');
  const rateEl   = document.getElementById('val-rate');

  inflEl.textContent  = fmt(state.inflation)    + '%';
  unempEl.textContent = fmt(state.unemployment) + '%';
  rateEl.textContent  = fmt(state.fedRate)      + '%';

  // Clear any old color classes so the number stays neutral (avoids clash with chart line colors)
  inflEl.classList.remove('near-target', 'over-target', 'under-target');
  unempEl.classList.remove('near-target', 'over-target', 'under-target');

  // Show a small status pill below each value instead of changing the number's color
  setIndicatorStatus('ind-inflation',    state.inflation,    TARGET_INFLATION,    0.5);
  setIndicatorStatus('ind-unemployment', state.unemployment, TARGET_UNEMPLOYMENT, 0.5);

  // Apply border state signal to parent indicator containers
  var setStateBorder = function(el, val, target) {
    var parent = el.closest ? el.closest('.indicator') : null;
    if (!parent) return;
    parent.classList.remove('state-over', 'state-under', 'state-near');
    var diff = val - target;
    if (Math.abs(diff) <= 0.5)   parent.classList.add('state-near');
    else if (diff > 0)            parent.classList.add('state-over');
    else                          parent.classList.add('state-under');
  };
  setStateBorder(inflEl,  state.inflation,    TARGET_INFLATION);
  setStateBorder(unempEl, state.unemployment, TARGET_UNEMPLOYMENT);
}

/** Show a small status pill inside an indicator container instead of coloring the number */
function setIndicatorStatus(parentId, val, target, thresh) {
  var parent = document.getElementById(parentId);
  if (!parent) return;
  var statusEl = parent.querySelector('.indicator-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'indicator-status';
    var targetEl = parent.querySelector('.indicator-target');
    if (targetEl) targetEl.parentNode.insertBefore(statusEl, targetEl.nextSibling);
    else parent.appendChild(statusEl);
  }
  var diff = val - target;
  statusEl.className = 'indicator-status';
  if (Math.abs(diff) <= thresh) {
    statusEl.textContent = '● On target';
    statusEl.classList.add('ind-status--good');
  } else if (diff > 0) {
    statusEl.textContent = '▲ Above target';
    statusEl.classList.add('ind-status--over');
  } else {
    statusEl.textContent = '▼ Below target';
    statusEl.classList.add('ind-status--under');
  }
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

/**
 * DEAD CODE — DO NOT USE OR MODIFY
 *
 * This is an earlier draft of renderNews() that is completely overridden at
 * runtime by the canonical implementation at ~line 1977 (JavaScript function
 * hoisting means the last same-named declaration wins in the same scope).
 *
 * This copy is missing: tier-gating (minor/moderate/major), the news-alert
 * banner logic, continuingShock handling, and tier normalisation. Any changes
 * must go to the active renderNews() near line 1977 instead.
 *
 * @deprecated superseded by renderNews() at ~line 1977
 */
function renderNews() {
  const shock = state.shockSchedule[state.quarter - 1];
  const label = document.getElementById('news-quarter-label');
  const badge = document.getElementById('news-badge');
  const body  = document.getElementById('news-body');

  // Quarter label — show quarter number and year
  const year = START_YEAR + Math.floor((state.quarter - 1) / 4);
  const qNum = ((state.quarter - 1) % 4) + 1;
  label.textContent = 'Q' + qNum + ' ' + year + ' — Economic Briefing';

  if (shock) {
    badge.textContent = shock.badge;
    badge.className   = 'news-badge shock';
    body.innerHTML    = '<p class="event-title">' + shock.title + '</p><p>' + shock.text + '</p>';
  } else {
    badge.textContent = 'ROUTINE';
    badge.className   = 'news-badge routine';
    const newsItem = selectRoutineNews(state); const routine = newsItem.text;
    body.innerHTML    = '<p>' + routine + '</p>';
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

  body.innerHTML += '<p style="margin-top:8px;font-style:italic;color:#555;font-size:0.83rem;">'
    + inflNote + ' ' + unempNote + '</p>';
}

/** Build and render the rate selector panel */
function renderRateSelector(preserveScroll) {
  const container = document.getElementById('rate-selector-list');
  if (!container) return;

  // Save scroll position before rebuilding innerHTML (innerHTML wipe resets scrollTop to 0)
  const savedScrollTop = container.scrollTop;

  // Generate rate options from min to max in steps of RATE_STEP
  let html = '';
  // Show rates from max down to min for visual "higher is up" feel
  for (let r = RATE_MAX; r >= RATE_MIN - 0.001; r -= RATE_STEP) {
    const rv     = Math.round(r * 100) / 100;
    const sel    = Math.abs(rv - state.pendingRate) < 0.001;
    const isCurr = Math.abs(rv - state.fedRate)     < 0.001;
    const cls    = sel ? 'rate-option selected' : isCurr ? 'rate-option current' : 'rate-option';
    html += `<div class="${cls}" data-rate="${rv}" onclick="selectRate(${rv})">`
          + `<span class="rate-val">${fmt(rv)}%</span>`
          + (isCurr ? '<span class="rate-tag current-tag">CURRENT</span>' : '')
          + (sel && !isCurr ? '<span class="rate-tag select-tag">SELECTED</span>' : '')
          + '</div>';
  }
  container.innerHTML = html;

  if (preserveScroll) {
    // User clicked a rate — restore their scroll position so the view doesn't jump
    container.scrollTop = savedScrollTop;
  } else {
    // New quarter start — center the selected (current) rate in the list
    requestAnimationFrame(() => {
      const sel = container.querySelector('.selected');
      if (!sel || container.clientHeight === 0) return;
      const cr = container.getBoundingClientRect();
      const sr = sel.getBoundingClientRect();
      container.scrollTop = Math.max(0,
        sr.top - cr.top + container.scrollTop - (container.clientHeight - sel.clientHeight) / 2
      );
    });
  }

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

  // Interest rate control restored here: keep the original selector markup,
  // placement, and summary, and only gate interaction while the graph animates.
  const goButton = document.querySelector('#panel-decision .btn-go');
  if (goButton) goButton.disabled = state.phase !== 'decision';
}

/** Handle rate option click */
function selectRate(rate) {
  if (state.phase !== 'decision') return;
  state.pendingRate = Math.round(rate * 100) / 100;
  renderRateSelector(true); // Preserve scroll position — don't jump to center
}

/** Append one row to the in-game history table */
function appendHistoryRow(record) {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  const year = START_YEAR + Math.floor((record.quarter - 1) / 4);
  const qNum = ((record.quarter - 1) % 4) + 1;
  const inflClass  = getDeviationClass(record.inflation,    TARGET_INFLATION,    0.5);
  const unempClass = getDeviationClass(record.unemployment, TARGET_UNEMPLOYMENT, 0.5);

  const row = document.createElement('tr');
  row.innerHTML = `
    <td>Q${qNum} ${year}</td>
    <td class="${inflClass}">${fmt(record.inflation)}%</td>
    <td class="${unempClass}">${fmt(record.unemployment)}%</td>
    <td>${fmt(record.rate)}%</td>
    <td>${record.decision}</td>
    <td>${record.eventTitle || '—'}</td>
  `;
  tbody.appendChild(row);

  // Do not auto-scroll history — would cause page to scroll unexpectedly
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

  body.innerHTML = `
    <p style="margin-bottom:10px;">${decisionText}</p>
    <div class="result-stat">
      <span class="label">Inflation</span>
      <span>${inflSign} ${fmt(prevInfl)}% &rarr; <strong>${fmt(newInfl)}%</strong>
        &nbsp;<span style="color:#888;font-size:0.78rem;">(target 2.0%)</span></span>
    </div>
    <div class="result-stat">
      <span class="label">Unemployment</span>
      <span>${unempSign} ${fmt(prevUnemp)}% &rarr; <strong>${fmt(newUnemp)}%</strong>
        &nbsp;<span style="color:#888;font-size:0.78rem;">(target 5.0%)</span></span>
    </div>
    <div class="result-stat">
      <span class="label">Fed Funds Rate</span>
      <span>${fmt(state.fedRate)}%</span>
    </div>
  `;

  // Quarter score display
  const qs = document.getElementById('result-quarter-score');
  if (qs) {
    qs.textContent = fmt(qPenalty, 2) + ' deviation pts';
    qs.style.color = qPenalty < 1.0 ? '#1a6b1a' : qPenalty < 2.5 ? '#c8a400' : '#b22222';
  }

  // Adjust next-button text on final quarter
  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) {
    nextBtn.textContent = state.quarter > (state.totalQuarters || TOTAL_QUARTERS)
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

  const toX = i  => pad + (i / (TOTAL_QUARTERS)) * (W - pad * 2);
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

function getAnimatedSparklinePoint() {
  if (!state.sparklineAnimation) return null;

  const progress = state.sparklineAnimation.progress;
  return {
    inflation: interpolateValue(state.sparklineAnimation.from.inflation, state.sparklineAnimation.to.inflation, progress),
    unemployment: interpolateValue(state.sparklineAnimation.from.unemployment, state.sparklineAnimation.to.unemployment, progress),
    rate: interpolateValue(state.sparklineAnimation.from.rate, state.sparklineAnimation.to.rate, progress)
  };
}

/** Redraw all three in-game sparklines from history */
function renderSparklines() {
  const inflHistory  = state.history.map(r => r.inflation);
  const unempHistory = state.history.map(r => r.unemployment);
  let rateHistory;
  const animatedPoint = getAnimatedSparklinePoint();

  if (animatedPoint) {
    // Quarter-to-quarter graph points are generated here: committed history is
    // preserved, and an interpolated next point is appended while time advances.
    inflHistory.push(animatedPoint.inflation);
    unempHistory.push(animatedPoint.unemployment);
    rateHistory = [INIT_RATE, ...state.history.slice(0, -1).map(r => r.rate), animatedPoint.rate];
  } else {
    inflHistory.push(state.inflation);
    unempHistory.push(state.unemployment);
    rateHistory = state.history.length > 0
      ? [INIT_RATE, ...state.history.map(r => r.rate)]
      : [state.fedRate];
  }

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
  ctx.fillStyle = color.replace(')', ',0.08)').replace('rgb', 'rgba');
  // simple alpha on hex color
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.globalAlpha = 1;
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
    const year    = START_YEAR + Math.floor((record.quarter - 1) / 4);
    const qNum    = ((record.quarter - 1) % 4) + 1;
    const inflClass  = getDeviationClass(record.inflation,    TARGET_INFLATION,    0.5);
    const unempClass = getDeviationClass(record.unemployment, TARGET_UNEMPLOYMENT, 0.5);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>Q${qNum} ${year}</td>
      <td class="${inflClass}">${fmt(record.inflation)}%</td>
      <td class="${unempClass}">${fmt(record.unemployment)}%</td>
      <td>${fmt(record.rate)}%</td>
      <td>${record.decision}</td>
      <td>${record.eventTitle || '—'}</td>
    `;
    tbody.appendChild(row);
  });
}

/** Render the full end screen */
function renderEndScreen() {
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

function finishSparklineAnimation() {
  if (!state.sparklineAnimation) return;

  const animation = state.sparklineAnimation;
  stopSparklineAnimation();

  state.inflation = animation.to.inflation;
  state.unemployment = animation.to.unemployment;
  state.fedRate = animation.to.rate;
  state.lagInflEffect = animation.nextLagInfl;
  state.lagUnempEffect = animation.nextLagUnemp;
  state.cumulativePenalty += animation.qPenalty;
  state.phase = 'result';

  renderIndicators();
  renderSparklines();
  renderHeader();
}

function startSparklineAnimation(animation) {
  stopSparklineAnimation();
  state.sparklineAnimation = { ...animation, progress: 0 };
  renderSparklines();

  const startedAt = performance.now();

  function step(now) {
    if (!state.sparklineAnimation) return;

    const rawProgress = Math.min(1, (now - startedAt) / GRAPH_ANIMATION_MS);
    state.sparklineAnimation.progress = easeSparklineProgress(rawProgress);
    renderSparklines();

    if (rawProgress < 1) {
      state.animationFrameId = requestAnimationFrame(step);
      return;
    }

    finishSparklineAnimation();
  }

  state.animationFrameId = requestAnimationFrame(step);
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
  showScreen('screen-intro');
}


/* ==========================================================================
   DOM READY — inject rate selector markup into the decision panel
   ========================================================================== */
function getQuarterInfo(quarterNumber) {
  const quarterIndex = quarterNumber - 1;
  const qNum = (quarterIndex % 4) + 1;
  const year = START_YEAR + Math.floor(quarterIndex / 4);
  return {
    qNum,
    year,
    label: 'Q' + qNum + ' ' + year
  };
}

function renderQuarterProgress() {
  const totalQ = (state.totalQuarters != null) ? state.totalQuarters : TOTAL_QUARTERS;
  const current = getQuarterInfo(state.quarter || 1);
  const start = getQuarterInfo(1);
  const end = getQuarterInfo(totalQ);
  const progress = totalQ === 1
    ? 100
    : ((state.quarter || 1) - 1) / (totalQ - 1) * 100;

  const currentLabel = document.getElementById('timeline-current-label');
  const startLabel = document.getElementById('timeline-start-label');
  const endLabel = document.getElementById('timeline-end-label');
  const progressLine = document.getElementById('timeline-progress-line');
  const progressMarker = document.getElementById('timeline-progress-marker');

  if (currentLabel) currentLabel.textContent = current.label;
  if (startLabel) startLabel.textContent = start.label;
  if (endLabel) endLabel.textContent = end.label;
  if (progressLine) progressLine.style.width = progress + '%';
  if (progressMarker) progressMarker.style.left = progress + '%';
}

function renderHeader() {
  const totalQ = (state.totalQuarters != null) ? state.totalQuarters : TOTAL_QUARTERS;
  document.getElementById('hdr-quarter').textContent =
    state.quarter + ' / ' + totalQ;

  const scoreEl = document.getElementById('hdr-score');
  if (state.history.length > 0) {
    const currentScore = calcFinalScore(state.cumulativePenalty * (totalQ / state.history.length));
    scoreEl.textContent = currentScore;
    scoreEl.classList.remove('hdr-score--good', 'hdr-score--ok', 'hdr-score--poor');
    if (currentScore >= 75)      scoreEl.classList.add('hdr-score--good');
    else if (currentScore >= 40) scoreEl.classList.add('hdr-score--ok');
    else                         scoreEl.classList.add('hdr-score--poor');
  } else {
    scoreEl.textContent = '\u2014';
    scoreEl.classList.remove('hdr-score--good', 'hdr-score--ok', 'hdr-score--poor');
  }

  renderQuarterProgress();
}

function renderNews() {
  var shock = state.shockSchedule[state.quarter - 1];
  var continuingShock = false;
  if (!shock && state.activeShockTurnsRemaining > 0 && state.activeShock) {
    shock = state.activeShock;
    continuingShock = true;
  }
  var quarterInfo = getQuarterInfo(state.quarter);
  var label = document.getElementById('news-quarter-label');
  var badge = document.getElementById('news-badge');
  var body  = document.getElementById('news-body');
  var alert = document.getElementById('news-alert');
  var alertHeadline = document.getElementById('news-alert-headline');
  var alertText     = document.getElementById('news-alert-text');

  label.textContent = quarterInfo.label + ' - Economic Briefing';

  // Determine severity tier: use shock.tier if present, fall back to 'major' for legacy events.
  // Normalise numeric tiers (1/2/3) to strings in case SHOCK_EVENTS uses either convention.
  var tier = shock ? (function(t) {
    if (t === 1 || t === 'minor')    return 'minor';
    if (t === 2 || t === 'moderate') return 'moderate';
    return 'major'; // 3, 'major', or missing
  })(shock.tier) : null;

  if (shock) {
    if (continuingShock) {
      badge.textContent = 'ONGOING';
      badge.className   = 'news-badge shock shock--ongoing';
      // Alert banner already shows the shock title; body shows only the remaining-turns reminder
      body.innerHTML = '<p class="news-continuing">'
        + '<span style="color:#8f6a00;font-weight:bold">Event ongoing</span> \u2014 '
        + state.activeShockTurnsRemaining + ' quarter'
        + (state.activeShockTurnsRemaining === 1 ? '' : 's') + ' remaining.</p>';
    } else if (tier === 'minor') {
      // Minor events: appear as informational update, no dramatic breaking-news treatment
      badge.textContent = 'ECONOMIC UPDATE';
      badge.className   = 'news-badge shock shock--minor';
      body.innerHTML = '<p class="event-title">' + shock.title + '</p>'
        + '<p>' + shock.text + '</p>';
    } else {
      // moderate or major (including legacy events without a tier)
      var badgeLabel = tier === 'moderate' ? 'ECONOMIC ALERT' : shock.badge;
      badge.textContent = badgeLabel;
      badge.className   = 'news-badge shock shock--' + tier
        + (shock.badge === 'CRISIS' ? ' crisis-badge' : '')
        + (shock.badge === 'BOOM'   ? ' boom-badge'   : '');

      var subHeadline = getShockSubHeadline(shock, state);
      body.innerHTML = '<p class="event-title">' + shock.title + '</p>'
        + '<p>' + shock.text + '</p>'
        + '<p class="news-sub-headline">' + subHeadline + '</p>';
    }

    // Flash the alert banner only for moderate/major events on their first quarter
    if (!continuingShock && tier !== 'minor' && alert && alertHeadline && alertText) {
      alertHeadline.textContent = shock.title;
      alertText.textContent     = '';  // details are already in the body below
      alert.classList.remove('hidden', 'news-alert--flash', 'news-alert--panic');
      void alert.offsetWidth;
      alert.classList.add('news-alert--flash');
      if (shock.badge === 'CRISIS' || tier === 'major') alert.classList.add('news-alert--panic');
    } else if (alert) {
      // minor events and continuing shocks: hide alert banner
      alert.classList.add('hidden');
      alert.classList.remove('news-alert--flash', 'news-alert--panic');
    }
  } else {
    var newsItem  = selectRoutineNews(state);
    badge.textContent = 'MARKET UPDATE';
    badge.className   = 'news-badge routine news-mood--' + newsItem.mood;
    body.innerHTML    = '<p>' + newsItem.text + '</p>';

    // Add reaction headline if last decision was notable
    var reaction = getReactionHeadline(state);
    if (reaction) {
      body.innerHTML += '<p class="news-market-react"><strong>Markets Reacting:</strong> ' + reaction + '</p>';
    }

    if (alert) {
      alert.classList.add('hidden');
      alert.classList.remove('news-alert--flash', 'news-alert--panic');
      if (alertHeadline) alertHeadline.textContent = '';
      if (alertText)     alertText.textContent     = '';
    }
  }

  // Contextual condition notes
  var inflNote = state.inflation > TARGET_INFLATION + 0.5
    ? 'Inflation is running above the Fed\'s 2% target.'
    : state.inflation < TARGET_INFLATION - 0.5
    ? 'Inflation is below the Fed\'s 2% target.'
    : 'Inflation is near the Fed\'s 2% target.';

  var unempNote = state.unemployment > TARGET_UNEMPLOYMENT + 0.5
    ? 'Unemployment is above the natural rate of 5%.'
    : state.unemployment < TARGET_UNEMPLOYMENT - 0.5
    ? 'Unemployment is below the natural rate of 5%.'
    : 'Unemployment is near its natural rate of 5%.';

  body.innerHTML += '<p class="news-context">' + inflNote + ' ' + unempNote + '</p>';

  // Show ongoing shock status banner only when a new shock is also firing this quarter
  // (i.e. body is showing a new shock AND there is still an older one in the background).
  // When continuingShock=true the body already displays the ongoing shock info, so the banner would duplicate it.
  var shockBannerEl = document.getElementById('shock-status-banner');
  if (state.activeShockTurnsRemaining > 0 && state.activeShock && !continuingShock) {
    if (!shockBannerEl) {
      shockBannerEl = document.createElement('div');
      shockBannerEl.id = 'shock-status-banner';
      shockBannerEl.className = 'shock-status-banner';
      var newsPanel = document.getElementById('news-body');
      if (newsPanel && newsPanel.parentNode) newsPanel.parentNode.appendChild(shockBannerEl);
    }
    shockBannerEl.innerHTML = '<span class="shock-status-icon">&#9888;</span> <strong>' + state.activeShock.title + '</strong> still in effect &mdash; ' + state.activeShockTurnsRemaining + ' quarter(s) remaining.';
    shockBannerEl.style.display = '';
  } else if (shockBannerEl) {
    shockBannerEl.style.display = 'none';
  }
}

function appendHistoryRow(record) {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  const quarterInfo = getQuarterInfo(record.quarter);
  const inflClass = getDeviationClass(record.inflation, TARGET_INFLATION, 0.5);
  const unempClass = getDeviationClass(record.unemployment, TARGET_UNEMPLOYMENT, 0.5);

  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${quarterInfo.label}</td>
    <td class="${inflClass}">${fmt(record.inflation)}%</td>
    <td class="${unempClass}">${fmt(record.unemployment)}%</td>
    <td>${fmt(record.rate)}%</td>
    <td>${record.decision}</td>
    <td>${record.eventTitle || '\u2014'}</td>
  `;
  tbody.appendChild(row);

  // Do not auto-scroll history — would cause page to scroll unexpectedly
}

function renderResult(rateDelta, newInfl, newUnemp, qPenalty) {
  const body = document.getElementById('result-body');

  const prevInfl = state.history.length > 0
    ? state.history[state.history.length - 1].inflation : INIT_INFLATION;
  const prevUnemp = state.history.length > 0
    ? state.history[state.history.length - 1].unemployment : INIT_UNEMPLOYMENT;

  const inflSign = newInfl >= prevInfl ? '&uarr;' : '&darr;';
  const unempSign = newUnemp >= prevUnemp ? '&uarr;' : '&darr;';

  const decisionText = Math.abs(rateDelta) < 0.001
    ? 'You held the rate steady at ' + fmt(state.fedRate) + '%.'
    : rateDelta > 0
    ? 'You raised the rate by ' + fmt(rateDelta) + '% to ' + fmt(state.fedRate) + '%.'
    : 'You lowered the rate by ' + fmt(Math.abs(rateDelta)) + '% to ' + fmt(state.fedRate) + '%.';

  body.innerHTML = `
    <p style="margin-bottom:10px;">${decisionText}</p>
    <div class="result-stat">
      <span class="label">Inflation</span>
      <span>${inflSign} ${fmt(prevInfl)}% &rarr; <strong>${fmt(newInfl)}%</strong>
        &nbsp;<span style="color:#888;font-size:0.78rem;">(target 2.0%)</span></span>
    </div>
    <div class="result-stat">
      <span class="label">Unemployment</span>
      <span>${unempSign} ${fmt(prevUnemp)}% &rarr; <strong>${fmt(newUnemp)}%</strong>
        &nbsp;<span style="color:#888;font-size:0.78rem;">(target 5.0%)</span></span>
    </div>
    <div class="result-stat">
      <span class="label">Fed Funds Rate</span>
      <span>${fmt(state.fedRate)}%</span>
    </div>
  `;

  const qs = document.getElementById('result-quarter-score');
  if (qs) {
    qs.textContent = fmt(qPenalty, 2) + ' deviation pts';
    qs.style.color = qPenalty < 1.0 ? '#1a6b1a' : qPenalty < 2.5 ? '#c8a400' : '#b22222';
  }

  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) {
    nextBtn.textContent = state.quarter >= (state.totalQuarters || TOTAL_QUARTERS)
      ? 'View Final Results ->'
      : 'Next Quarter ->';
  }
}

function renderEndHistory() {
  const tbody = document.getElementById('end-history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.history.forEach(record => {
    const quarterInfo = getQuarterInfo(record.quarter);
    const inflClass = getDeviationClass(record.inflation, TARGET_INFLATION, 0.5);
    const unempClass = getDeviationClass(record.unemployment, TARGET_UNEMPLOYMENT, 0.5);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${quarterInfo.label}</td>
      <td class="${inflClass}">${fmt(record.inflation)}%</td>
      <td class="${unempClass}">${fmt(record.unemployment)}%</td>
      <td>${fmt(record.rate)}%</td>
      <td>${record.decision}</td>
      <td>${record.eventTitle || '\u2014'}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderEndScreen() {
  const finalScore = calcFinalScore(state.cumulativePenalty);
  const verdict = getVerdict(finalScore);

  const card = document.getElementById('end-verdict-card');
  card.className = 'end-verdict-card ' + verdict.cssClass;
  card.querySelectorAll('.end-shock-note').forEach(note => note.remove());

  document.getElementById('end-verdict-title').textContent = verdict.title;
  document.getElementById('end-score').textContent = finalScore + ' / 100';
  document.getElementById('end-verdict-text').textContent = verdict.text;

  const avgInfl = state.history.reduce((sum, record) => sum + record.inflation, 0) / state.history.length;
  const avgUnemp = state.history.reduce((sum, record) => sum + record.unemployment, 0) / state.history.length;

  document.getElementById('end-avg-infl').textContent = fmt(avgInfl) + '%';
  document.getElementById('end-avg-unemp').textContent = fmt(avgUnemp) + '%';
  document.getElementById('end-final-rate').textContent = fmt(state.fedRate) + '%';
  document.getElementById('end-final-rate-start').textContent = 'Started: ' + fmt(INIT_RATE) + '%';

  setIndicatorClass(document.getElementById('end-avg-infl'), avgInfl, TARGET_INFLATION, 0.5, 1.5);
  setIndicatorClass(document.getElementById('end-avg-unemp'), avgUnemp, TARGET_UNEMPLOYMENT, 0.5, 1.5);

  renderEndCharts();
  renderEndHistory();

  const shocksOccurred = state.history
    .filter(record => record.eventTitle)
    .map(record => record.eventTitle);

  if (shocksOccurred.length > 0) {
    const shockNote = document.createElement('p');
    shockNote.className = 'end-shock-note';
    shockNote.style.cssText = 'font-size:0.83rem;color:#555;text-align:center;margin:8px 0 0;font-style:italic;';
    shockNote.textContent = 'Events during your term: ' + [...new Set(shocksOccurred)].join(', ') + '.';
    card.appendChild(shockNote);
  }
}

function startGame() {
  stopSparklineAnimation();
  state = createInitialState();
  document.getElementById('history-tbody').innerHTML = '';
  document.getElementById('end-history-tbody').innerHTML = '';
  showScreen('screen-game');
  beginQuarter();
}

function beginQuarter() {
  stopSparklineAnimation();
  state.phase = 'decision';
  state.pendingRate = state.fedRate;

  renderHeader();
  renderIndicators();
  renderNews();
  renderSparklines();
  renderRateSelector();

  document.getElementById('panel-decision').classList.remove('hidden');
  document.getElementById('panel-result').classList.add('hidden');
}

function makeDecision() {
  if (state.phase !== 'decision') return;

  const previousRate = state.fedRate;
  const nextRate = state.pendingRate;
  const rateDelta = Math.round((nextRate - previousRate) * 100) / 100;

  const result = advanceEconomy(rateDelta);
  const qPenalty = calcQuarterPenalty(state.inflation, state.unemployment);

  let decisionLabel = 'Hold';
  if (rateDelta > 0) {
    decisionLabel = 'Raise +' + fmt(rateDelta) + '%';
  } else if (rateDelta < 0) {
    decisionLabel = 'Lower -' + fmt(Math.abs(rateDelta)) + '%';
  }

  const shock = state.shockSchedule[state.quarter - 1];
  const record = {
    quarter: state.quarter,
    inflation: state.inflation,
    unemployment: state.unemployment,
    rate: nextRate,
    decision: decisionLabel,
    eventTitle: shock ? shock.title : null
  };

  state.phase = 'animating';
  state.fedRate = nextRate;
  state.history.push(record);
  appendHistoryRow(record);

  renderResult(rateDelta, result.newInflation, result.newUnemployment, qPenalty);

  document.getElementById('panel-decision').classList.add('hidden');
  document.getElementById('panel-result').classList.remove('hidden');

  startSparklineAnimation({
    from: {
      inflation: record.inflation,
      unemployment: record.unemployment,
      rate: previousRate
    },
    to: {
      inflation: result.newInflation,
      unemployment: result.newUnemployment,
      rate: nextRate
    },
    nextLagInfl: result.nextLagInfl,
    nextLagUnemp: result.nextLagUnemp,
    qPenalty
  });
}

function nextQuarter() {
  if (state.phase !== 'result') return;
  if (state.quarter >= TOTAL_QUARTERS) {
    renderEndScreen();
    showScreen('screen-end');
    return;
  }

  state.quarter++;
  beginQuarter();
}

function resetGame() {
  stopSparklineAnimation();
  state = {};
  document.getElementById('history-tbody').innerHTML = '';
  document.getElementById('end-history-tbody').innerHTML = '';
  document.getElementById('end-verdict-card').querySelectorAll('.end-shock-note').forEach(note => note.remove());
  showScreen('screen-intro');
}

document.addEventListener('DOMContentLoaded', () => {
  renderQuarterProgress();
  const endStart = document.getElementById('end-final-rate-start');
  if (endStart) endStart.textContent = 'Started: ' + fmt(INIT_RATE) + '%';
});

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
          <button class="btn-go" onclick="makeDecision()">GO &rarr;</button>
        </div>
      </div>
    `;
  }
});

/* ==========================================================================
   MAIN SHARED CHART OVERRIDES
   Keep the existing rate selector behavior, but move the primary history view
   to one large overlaid graph in the center of the game screen.
   ========================================================================== */

const MAIN_CHART_Y_MIN = 0;
const MAIN_CHART_Y_MAX = 10;
const MAIN_CHART_COLORS = {
  inflation: '#b22222',
  unemployment: '#1a2a4a',
  rate: '#c8a400',
  grid: '#d8d1c3',
  axis: '#5b564b',
  plotBg: '#fcfbf7',
  frame: '#cfc7b8'
};

function buildChartPoint(completedQuarter, inflation, unemployment, rate) {
  return {
    completedQuarter,
    inflation,
    unemployment,
    rate
  };
}

function createInitialState(seed) {
  // Apply the selected difficulty profile to global tuning constants.
  applyDifficultyToConstants();

  const d   = currentDifficulty;
  const mag = d.shockMagnitudeMultiplier;
  const rng = (seed != null) ? seededRandom(seed) : Math.random.bind(Math);

  // Build shock schedule then adjust count and scale magnitudes for difficulty.
  let schedule = buildShockSchedule(seed).map(entry =>
    entry == null ? null : {
      ...entry,
      inflEffect:  entry.inflEffect  * mag,
      unempEffect: entry.unempEffect * mag,
      inflLag:     (entry.inflLag  || 0) * mag,
      unempLag:    (entry.unempLag || 0) * mag
    }
  );

  const targetCount  = Math.min(d.shocksPerRun, SHOCK_EVENTS.length);
  const currentCount = schedule.filter(e => e !== null).length;

  if (targetCount < currentCount) {
    // Remove excess shocks (Textbook: fewer shocks)
    let toRemove = currentCount - targetCount;
    schedule = schedule.map(entry => {
      if (entry !== null && toRemove > 0) { toRemove--; return null; }
      return entry;
    });
  } else if (targetCount > currentCount) {
    // Add more shocks (Crisis: replace nulls with extra scaled shocks)
    const extras = [...SHOCK_EVENTS]
      .sort(() => rng() - 0.5)
      .slice(0, targetCount - currentCount)
      .map(s => ({
        ...s,
        inflEffect:  s.inflEffect  * mag,
        unempEffect: s.unempEffect * mag,
        inflLag:     (s.inflLag  || 0) * mag,
        unempLag:    (s.unempLag || 0) * mag
      }));
    let addIdx = 0;
    schedule = schedule.map(entry =>
      (entry === null && addIdx < extras.length) ? extras[addIdx++] : entry
    );
  }

  // Use difficulty-specific starting conditions if defined
  const initInflation    = d.initInflation    != null ? d.initInflation    : INIT_INFLATION;
  const initUnemployment = d.initUnemployment != null ? d.initUnemployment : INIT_UNEMPLOYMENT;

  return {
    quarter: 1,
    inflation: initInflation,
    unemployment: initUnemployment,
    fedRate: INIT_RATE,
    pendingRate: INIT_RATE,
    lagInflEffect: 0,
    lagUnempEffect: 0,
    history: [],
    shockSchedule: schedule,
    cumulativePenalty: 0,
    phase: 'decision',
    chartPoints: [buildChartPoint(0, initInflation, initUnemployment, INIT_RATE)],
    chartAnimation: null,
    animationFrameId: 0,
    // Multi-turn shock tracking
    activeShock:               null,  // shock object persisting across quarters (or null)
    activeShockTurnsRemaining: 0,     // quarters remaining for active shock
    seed:                      seed != null ? seed : null,
    // Seeded noise RNG — separate derivation from shock-schedule RNG so sequences don't overlap.
    // Gives deterministic per-quarter noise when replaying the same seed.
    noiseRng: seed != null
      ? seededRandom(((seed >>> 0) ^ 0xdeadbeef) >>> 0 || 0xdeadbeef)
      : Math.random.bind(Math),
    // Achievement tracking
    unlockedAchievements: [],
    achievementStats: {
      maxInflation:          -Infinity,
      minInflation:          Infinity,
      consecutiveHolds:      0,
      maxConsecutiveHolds:   0,
      lowRateQuarters:       0,    // quarters with rate == RATE_MIN (0.25)
      rateDirectionChanges:  0,
      lastRateDirection:     0,    // -1 lower, 0 hold, +1 raise
      duration3ShocksCount:  0,    // shocks with duration === 3 experienced
      unemploymentSpikes:    0,    // times unemployment > 8% in distinct quarters
      totalRateRaised:       0,    // cumulative rate increases
      totalRateLowered:      0     // cumulative rate decreases (positive = magnitude)
    }
  };
}

function stopMainChartAnimation() {
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = 0;
  }
  state.chartAnimation = null;
}

function syncCanvasSize(canvas) {
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { ctx, width: rect.width, height: rect.height };
}

function getWorkingChartPoints() {
  const points = (state.chartPoints || [buildChartPoint(0, INIT_INFLATION, INIT_UNEMPLOYMENT, INIT_RATE)])
    .map(point => ({ ...point }));

  if (!state.chartAnimation) return points;

  const from = state.chartAnimation.from;
  const to = state.chartAnimation.to;
  const progress = state.chartAnimation.progress;

  points.push({
    completedQuarter: interpolateValue(from.completedQuarter, to.completedQuarter, progress),
    inflation: interpolateValue(from.inflation, to.inflation, progress),
    unemployment: interpolateValue(from.unemployment, to.unemployment, progress),
    rate: interpolateValue(from.rate, to.rate, progress)
  });

  return points;
}

function getQuarterAxisLabel(quarterNumber) {
  const info = getQuarterInfo(quarterNumber);
  return quarterNumber % 4 === 1
    ? `Q${info.qNum} '${String(info.year).slice(-2)}`
    : `Q${info.qNum}`;
}

function drawSharedSeries(ctx, points, accessor, color, toX, toY) {
  if (!points.length) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();

  points.forEach((point, index) => {
    const x = toX(point.completedQuarter);
    const y = toY(accessor(point));
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  const lastPoint = points[points.length - 1];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(toX(lastPoint.completedQuarter), toY(accessor(lastPoint)), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function renderMainChart() {
  const canvas = document.getElementById('main-chart');
  const synced = syncCanvasSize(canvas);
  if (!synced) return;

  const { ctx, width, height } = synced;
  const plot = {
    left: 54,
    top: 18,
    right: width - 18,
    bottom: height - 54
  };
  plot.width = plot.right - plot.left;
  plot.height = plot.bottom - plot.top;

  const points = getWorkingChartPoints();
  const toX = value => plot.left + (value / TOTAL_QUARTERS) * plot.width;
  const toY = value => {
    const bounded = Math.max(MAIN_CHART_Y_MIN, Math.min(MAIN_CHART_Y_MAX, value));
    const pct = (bounded - MAIN_CHART_Y_MIN) / (MAIN_CHART_Y_MAX - MAIN_CHART_Y_MIN);
    return plot.bottom - pct * plot.height;
  };

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = MAIN_CHART_COLORS.plotBg;
  ctx.fillRect(plot.left, plot.top, plot.width, plot.height);
  ctx.strokeStyle = MAIN_CHART_COLORS.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);

  ctx.font = '11px Arial';
  ctx.fillStyle = MAIN_CHART_COLORS.axis;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let value = MAIN_CHART_Y_MIN; value <= MAIN_CHART_Y_MAX; value += 1) {
    const y = toY(value);
    ctx.strokeStyle = value === 0 ? MAIN_CHART_COLORS.frame : MAIN_CHART_COLORS.grid;
    ctx.lineWidth = value % 2 === 0 ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.fillText(String(value), plot.left - 10, y);
  }

  for (let quarter = 0; quarter <= TOTAL_QUARTERS; quarter += 1) {
    const x = toX(quarter);
    ctx.strokeStyle = quarter === 0 ? MAIN_CHART_COLORS.frame : '#e6dfd2';
    ctx.lineWidth = quarter % 4 === 0 ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.bottom);
    ctx.stroke();
  }

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(178, 34, 34, 0.65)';
  ctx.beginPath();
  ctx.moveTo(plot.left, toY(TARGET_INFLATION));
  ctx.lineTo(plot.right, toY(TARGET_INFLATION));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(26, 42, 74, 0.55)';
  ctx.beginPath();
  ctx.moveTo(plot.left, toY(TARGET_UNEMPLOYMENT));
  ctx.lineTo(plot.right, toY(TARGET_UNEMPLOYMENT));
  ctx.stroke();
  ctx.restore();

  ctx.font = '10px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(178, 34, 34, 0.8)';
  ctx.fillText('Inflation Target 2%', plot.left + 8, toY(TARGET_INFLATION) - 4);
  ctx.fillStyle = 'rgba(26, 42, 74, 0.8)';
  ctx.fillText('Unemployment Target 5%', plot.left + 8, toY(TARGET_UNEMPLOYMENT) - 4);

  drawSharedSeries(ctx, points, point => point.inflation, MAIN_CHART_COLORS.inflation, toX, toY);
  drawSharedSeries(ctx, points, point => point.unemployment, MAIN_CHART_COLORS.unemployment, toX, toY);
  drawSharedSeries(ctx, points, point => point.rate, MAIN_CHART_COLORS.rate, toX, toY);

  ctx.font = '11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = MAIN_CHART_COLORS.axis;
  for (let quarter = 1; quarter <= TOTAL_QUARTERS; quarter += 1) {
    ctx.fillText(getQuarterAxisLabel(quarter), toX(quarter), plot.bottom + 10);
  }

  ctx.save();
  ctx.translate(16, plot.top + plot.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Percent', 0, 0);
  ctx.restore();
}

function renderSparklines() {
  renderMainChart();
}

function renderEndCharts() {
  const points = (state.chartPoints || []).slice(1);
  drawEndChart('end-chart-inflation', points.map(point => point.inflation), TARGET_INFLATION, '#b22222', 0, 8);
  drawEndChart('end-chart-unemployment', points.map(point => point.unemployment), TARGET_UNEMPLOYMENT, '#1a2a4a', 2, 12);
  drawEndChart('end-chart-rate', points.map(point => point.rate), INIT_RATE, '#c8a400', 0, 10);
}

function finishMainChartAnimation() {
  if (!state.chartAnimation) return;

  const animation = state.chartAnimation;
  stopMainChartAnimation();

  state.chartPoints.push(animation.to);
  state.inflation = animation.to.inflation;
  state.unemployment = animation.to.unemployment;
  state.fedRate = animation.to.rate;
  state.lagInflEffect = animation.nextLagInfl;
  state.lagUnempEffect = animation.nextLagUnemp;
  state.cumulativePenalty += animation.qPenalty;
  state.phase = 'result';

  renderIndicators();
  renderHeader();
  renderMainChart();
  renderRateSelector();

  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) {
    nextBtn.disabled = false;
    const limit = (state.totalQuarters != null) ? state.totalQuarters : TOTAL_QUARTERS;
    if (state.quarter >= limit) {
      nextBtn.textContent = 'See Final Results \u2192';
      nextBtn.classList.add('btn-next--final');
    } else {
      nextBtn.textContent = 'Next Quarter \u2192';
      nextBtn.classList.remove('btn-next--final');
    }
  }
}

function startMainChartAnimation(animation) {
  stopMainChartAnimation();
  state.chartAnimation = { ...animation, progress: 0 };

  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) nextBtn.disabled = true;

  renderMainChart();

  const startedAt = performance.now();
  function step(now) {
    if (!state.chartAnimation) return;

    const rawProgress = Math.min(1, (now - startedAt) / GRAPH_ANIMATION_MS);
    state.chartAnimation.progress = easeSparklineProgress(rawProgress);
    renderMainChart();

    if (rawProgress < 1) {
      state.animationFrameId = requestAnimationFrame(step);
      return;
    }

    finishMainChartAnimation();
  }

  state.animationFrameId = requestAnimationFrame(step);
}

function startGame(seedValue) {
  stopMainChartAnimation();
  const seed = (seedValue != null) ? seedValue : null;
  state = createInitialState(seed);
  state.seed = seed;
  state.lastSeed = seed;
  state.totalQuarters = TOTAL_QUARTERS;
  state.sandboxMode = false;
  state.isDailyChallenge = (seed != null && seed === getDailySeed());
  document.getElementById('history-tbody').innerHTML = '';
  document.getElementById('end-history-tbody').innerHTML = '';
  document.getElementById('end-verdict-card').querySelectorAll('.end-shock-note').forEach(note => note.remove());

  // Update seed display in game header
  const seedDisplay = document.getElementById('hdr-seed');
  const seedContainer = document.getElementById('hdr-seed-container');
  if (seedDisplay && seedContainer) {
    if (seed != null) {
      seedDisplay.textContent = seed;
      seedContainer.style.display = '';
    } else {
      seedContainer.style.display = 'none';
    }
  }
  // Hide sandbox banner
  const sandboxBanner = document.getElementById('sandbox-banner');
  if (sandboxBanner) sandboxBanner.style.display = 'none';

  showScreen('screen-game');
  beginQuarter();
}

function beginQuarter() {
  stopMainChartAnimation();
  state.phase = 'decision';
  state.pendingRate = state.fedRate;

  renderHeader();
  renderIndicators();
  renderNews();
  renderAdvisors();
  renderMainChart();

  // Show decision panel BEFORE rendering rate selector so the container is visible.
  // This ensures getBoundingClientRect() returns correct coords for scroll centering.
  document.getElementById('panel-decision').classList.remove('hidden');
  document.getElementById('panel-result').classList.add('hidden');

  renderRateSelector();
}

function makeDecision() {
  if (state.phase !== 'decision') return;

  const previousPoint = state.chartPoints[state.chartPoints.length - 1];
  const nextRate = state.pendingRate;
  const rateDelta = Math.round((nextRate - state.fedRate) * 100) / 100;
  const result = advanceEconomy(rateDelta);
  const qPenalty = calcQuarterPenalty(state.inflation, state.unemployment);

  let decisionLabel = 'Hold';
  if (rateDelta > 0) decisionLabel = 'Raise +' + fmt(rateDelta) + '%';
  if (rateDelta < 0) decisionLabel = 'Lower -' + fmt(Math.abs(rateDelta)) + '%';

  const shock = state.shockSchedule[state.quarter - 1];
  const record = {
    quarter: state.quarter,
    inflation: state.inflation,
    unemployment: state.unemployment,
    rate: nextRate,
    decision: decisionLabel,
    eventTitle: shock ? shock.title : null
  };

  state.phase = 'animating';
  state.fedRate = nextRate;
  state.history.push(record);
  appendHistoryRow(record);

  // Track achievement stats for this quarter
  updateAchievementStats(record, rateDelta);

  renderResult(rateDelta, result.newInflation, result.newUnemployment, qPenalty);
  document.getElementById('panel-decision').classList.add('hidden');
  document.getElementById('panel-result').classList.remove('hidden');
  // Scroll the right column to the top so result panel is immediately visible
  const sideEl = document.querySelector('.panel-side');
  if (sideEl) sideEl.scrollTop = 0;

  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) nextBtn.disabled = true;

  renderIndicators();
  // Intentionally NOT calling renderRateSelector() here — panel-decision is hidden at this point.
  // Calling it on a hidden container resets scrollTop to 0 and corrupts the player's scroll position.
  // beginQuarter() will rebuild the selector once the panel is visible again.

  startMainChartAnimation({
    from: previousPoint,
    to: buildChartPoint(state.quarter, result.newInflation, result.newUnemployment, nextRate),
    nextLagInfl: result.nextLagInfl,
    nextLagUnemp: result.nextLagUnemp,
    qPenalty
  });
}

function nextQuarter() {
  if (state.phase !== 'result') return;

  const limit = (state.totalQuarters != null) ? state.totalQuarters : TOTAL_QUARTERS;
  if (state.quarter >= limit) {
    // Show screen first (makes elements visible for canvas drawing),
    // then populate content. showScreen's rAF scrolls to the breakdown
    // after layout settles; the double-rAF in renderEndScreen animates bars.
    showScreen('screen-end', 'end-score-breakdown');
    renderEndScreen();
    return;
  }

  state.quarter += 1;
  beginQuarter();
}

/** Hamburger menu toggle */
function toggleGameMenu() {
  var menu = document.getElementById('game-menu');
  var btn  = document.getElementById('btn-hamburger');
  if (!menu || !btn) return;
  var isOpen = !menu.classList.contains('hidden');
  menu.classList.toggle('hidden', isOpen);
  btn.setAttribute('aria-expanded', String(!isOpen));
  btn.classList.toggle('is-open', !isOpen);
}

function closeGameMenu() {
  var menu = document.getElementById('game-menu');
  var btn  = document.getElementById('btn-hamburger');
  if (menu) menu.classList.add('hidden');
  if (btn)  { btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('is-open'); }
}

// Close menu when clicking outside
document.addEventListener('click', function(e) {
  var btn  = document.getElementById('btn-hamburger');
  var menu = document.getElementById('game-menu');
  if (!btn || !menu) return;
  if (!btn.contains(e.target) && !menu.contains(e.target)) {
    closeGameMenu();
  }
});

function resetGame() {
  stopMainChartAnimation();
  closeGameMenu();
  const lastSeed = (state && state.lastSeed != null) ? state.lastSeed : null;
  state = { lastSeed };
  document.getElementById('history-tbody').innerHTML = '';
  document.getElementById('end-history-tbody').innerHTML = '';
  document.getElementById('end-verdict-card').querySelectorAll('.end-shock-note').forEach(note => note.remove());
  const sandboxBanner = document.getElementById('sandbox-banner');
  if (sandboxBanner) sandboxBanner.style.display = 'none';
  showScreen('screen-intro');
}

// ==========================================================================
// SEEDING SYSTEM & ONE-MORE-TURN FLOW
// ==========================================================================

/** Returns today's UTC date as YYYYMMDD integer — same for all players worldwide on the same calendar day. */
function getDailySeed() {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/**
 * Maps any string to a stable positive 32-bit integer seed.
 * Same string always yields the same seed.
 */
function stringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) || 1;
}

/** Reads #seed-input and starts a seeded (or random) game. */
function startGameWithSeedInput() {
  const raw = ((document.getElementById('seed-input') || {}).value || '').trim();
  if (!raw) { startGame(); return; }
  const asNum = Number(raw);
  const seed = Number.isInteger(asNum) && asNum > 0 ? asNum : stringToSeed(raw);
  startGame(seed);
}

/** Replays the most recent run with the exact same seed (random if no seed was used). */
function replayWithSameSeed() {
  startGame(state.lastSeed != null ? state.lastSeed : undefined);
}

/**
 * Copy a shareable result string to the clipboard.
 * Falls back to window.prompt on browsers without Clipboard API.
 */
function copyResultToClipboard() {
  var finalScore = calcFinalScore(state.cumulativePenalty);
  var verdict = getVerdict(finalScore);
  var text = getEndScreenShareText(finalScore, verdict);
  var btn = document.getElementById('btn-share-result');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(function() {
          btn.textContent = '\uD83D\uDCCB Copy Result';
        }, 1500);
      }
    }).catch(function() {
      window.prompt('Copy your result:', text);
    });
  } else {
    window.prompt('Copy your result:', text);
  }
}

/** Returns to the intro screen for a fresh run. */
function startNewRun() {
  resetGame();
}

/**
 * Extends the completed run to 24 quarters in sandbox mode.
 * Appends null (routine-quarter) slots to cover extra quarters.
 */
function startSandboxMode() {
  state.totalQuarters = 24;
  state.sandboxMode = true;
  while (state.shockSchedule.length < 24) state.shockSchedule.push(null);

  const sandboxBanner = document.getElementById('sandbox-banner');
  if (sandboxBanner) sandboxBanner.style.display = '';

  showScreen('screen-game');
  state.quarter += 1;
  state.phase = 'decision';
  beginQuarter();
}

// R-key shortcut: press R on the end screen to start a new run
document.addEventListener('keydown', function(e) {
  if (e.key !== 'r' && e.key !== 'R') return;
  const endScreen = document.getElementById('screen-end');
  if (endScreen && endScreen.classList.contains('active')) {
    startNewRun();
  }
});

window.addEventListener('resize', () => {
  const gameScreen = document.getElementById('screen-game');
  const endScreen = document.getElementById('screen-end');

  if (gameScreen && gameScreen.classList.contains('active')) {
    renderMainChart();
  }

  if (endScreen && endScreen.classList.contains('active')) {
    renderEndCharts();
  }
});


/* ==========================================================================
   T8 INTEGRATION — Fixed startGame + Enhanced renderEndScreen
   ========================================================================== */

/**
 * Start a new game run. Accepts optional integer seed for deterministic play.
 * Overrides earlier startGame definitions — this is the active version.
 */
function startGame(seed) {
  stopMainChartAnimation();
  // Always use a seed so every run can be replayed. Generate one if not supplied.
  if (seed == null) {
    seed = Math.floor(Math.random() * 1000000000) + 1;
  }
  state = createInitialState(seed);
  state.lastSeed = seed;
  state.isDailyChallenge = (seed === getDailySeed());

  document.getElementById('history-tbody').innerHTML = '';
  document.getElementById('end-history-tbody').innerHTML = '';
  document.getElementById('end-verdict-card').querySelectorAll('.end-shock-note').forEach(el => el.remove());

  // Always hide sandbox banner on any new run start
  const sandboxBannerEl = document.getElementById('sandbox-banner');
  if (sandboxBannerEl) sandboxBannerEl.style.display = 'none';

  // Always show seed in header so players can note it for replay
  const seedContainer = document.getElementById('hdr-seed-container');
  const seedEl = document.getElementById('hdr-seed');
  if (seedContainer && seedEl) {
    seedEl.textContent = String(seed);
    seedContainer.style.display = '';
  }

  showScreen('screen-game');
  beginQuarter();
}

/**
 * Enhanced end screen renderer — uses Builder 3's scoring functions and
 * Builder 6's HTML elements (soft landing, breakdown, best/worst quarters).
 * Overrides all earlier renderEndScreen definitions.
 */
function renderEndScreen() {
  const finalScore = calcFinalScore(state.cumulativePenalty);
  const verdict = getVerdict(finalScore);

  // Check end-of-run achievements (score is now known)
  checkEndAchievements(finalScore);

  // Verdict card
  const card = document.getElementById('end-verdict-card');
  card.className = 'end-verdict-card ' + verdict.cssClass;
  card.querySelectorAll('.end-shock-note').forEach(el => el.remove());

  document.getElementById('end-verdict-title').textContent = verdict.title;
  document.getElementById('end-score').textContent = finalScore + ' / 100';
  document.getElementById('end-verdict-text').textContent = verdict.text;

  // Subtitle badge (inserted dynamically if element doesn't exist yet)
  let subtitleEl = document.getElementById('end-verdict-subtitle');
  if (!subtitleEl && verdict.subtitle) {
    subtitleEl = document.createElement('div');
    subtitleEl.id = 'end-verdict-subtitle';
    subtitleEl.style.cssText =
      'font-family:Arial;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;' +
      'color:#666;margin:0 0 8px;text-align:center;';
    const scoreLabel = card.querySelector('.verdict-score-label');
    if (scoreLabel) card.insertBefore(subtitleEl, scoreLabel);
  }
  if (subtitleEl) subtitleEl.textContent = verdict.subtitle || '';

  // Avg stats
  const avgInfl  = state.history.reduce((s, r) => s + r.inflation,    0) / state.history.length;
  const avgUnemp = state.history.reduce((s, r) => s + r.unemployment, 0) / state.history.length;

  document.getElementById('end-avg-infl').textContent   = fmt(avgInfl)  + '%';
  document.getElementById('end-avg-unemp').textContent  = fmt(avgUnemp) + '%';
  document.getElementById('end-final-rate').textContent = fmt(state.fedRate) + '%';
  document.getElementById('end-final-rate-start').textContent = 'Started: ' + fmt(INIT_RATE) + '%';

  setIndicatorClass(document.getElementById('end-avg-infl'),  avgInfl,  TARGET_INFLATION,    0.5, 1.5);
  setIndicatorClass(document.getElementById('end-avg-unemp'), avgUnemp, TARGET_UNEMPLOYMENT, 0.5, 1.5);

  // Soft landing indicator
  const softLanding = getSoftLandingStatus(state.history);
  const softEl = document.getElementById('end-soft-landing');
  if (softEl) {
    const valEl = softEl.querySelector('.end-soft-landing-value');
    if (valEl) {
      valEl.textContent = softLanding ? 'Yes \u2014 Achieved!' : 'No';
      valEl.style.color  = softLanding ? '#1a6b1a' : '#b22222';
      valEl.style.fontWeight = softLanding ? 'bold' : 'normal';
    }
  }

  // Best / worst quarters
  const { best, worst } = getBestWorstQuarters(state.history);
  const bestWorstEl = document.getElementById('end-best-worst');
  if (bestWorstEl && best && worst) {
    const ql = r => getQuarterInfo(r.quarter).label;
    bestWorstEl.innerHTML =
      '<span style="color:#1a6b1a;font-size:0.82rem;">\u25b2 Best: ' + ql(best) +
      ' (' + fmt(best.inflation) + '% infl, ' + fmt(best.unemployment) + '% unemp)</span>' +
      '&nbsp;&nbsp;' +
      '<span style="color:#b22222;font-size:0.82rem;">\u25bc Worst: ' + ql(worst) +
      ' (' + fmt(worst.inflation) + '% infl, ' + fmt(worst.unemployment) + '% unemp)</span>';
  }

  // Score breakdown (4 dimensions)
  const breakdown = calcScoreBreakdown(state.history);
  const breakdownEl = document.getElementById('end-score-breakdown');
  if (breakdownEl) {
    const bdItems = [
      { label: 'Inflation Control',     score: breakdown.inflScore },
      { label: 'Employment Stability',  score: breakdown.unempScore },
      { label: 'Policy Consistency',    score: breakdown.consistencyScore },
      { label: 'Crisis Handling',       score: breakdown.crisisScore }
    ];
    // Render bars at 0% width first so the CSS transition animates them into view
    breakdownEl.innerHTML = bdItems.map(({ label, score }) => {
      const fillClass = score >= 75 ? 'bd-fill--good' : score >= 50 ? 'bd-fill--ok' : 'bd-fill--poor';
      return '<div class="bd-row">' +
        '<span class="bd-label">' + label + '</span>' +
        '<span class="bd-track"><span class="bd-fill ' + fillClass + '" style="width:0%" data-score="' + score + '"></span></span>' +
        '<span class="bd-value">' + score + '</span>' +
        '</div>';
    }).join('');
    // Double-rAF: first frame paints elements at 0%, second triggers the CSS transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        breakdownEl.querySelectorAll('.bd-fill[data-score]').forEach(el => {
          el.style.width = el.dataset.score + '%';
        });
      });
    });
  }

  // Events summary
  const shocksOccurred = state.history.filter(r => r.eventTitle).map(r => r.eventTitle);
  if (shocksOccurred.length > 0) {
    const shockNote = document.createElement('p');
    shockNote.className = 'end-shock-note';
    shockNote.style.cssText = 'font-size:0.83rem;color:#555;text-align:center;margin:8px 0 0;font-style:italic;';
    shockNote.textContent = 'Events during your term: ' + [...new Set(shocksOccurred)].join(', ') + '.';
    card.appendChild(shockNote);
  }

  renderEndCharts();
  renderEndHistory();

  // --- Share text ---
  const shareEl = document.getElementById('end-share-text');
  if (shareEl) shareEl.value = getEndScreenShareText(finalScore, verdict);

  // --- Achievements panel ---
  // Render any achievements earned this run into the end screen
  renderEndAchievements();

  // --- Seed display on end screen ---
  // Ensure the player can always note their seed for future replay
  let endSeedEl = document.getElementById('end-seed-display');
  if (!endSeedEl) {
    endSeedEl = document.createElement('p');
    endSeedEl.id = 'end-seed-display';
    endSeedEl.className = 'end-seed-display';
    const actionsEl = document.querySelector('.end-actions');
    if (actionsEl) actionsEl.parentNode.insertBefore(endSeedEl, actionsEl);
  }
  if (state.lastSeed != null) {
    endSeedEl.innerHTML = 'Run seed: <span class="end-seed-value">' + state.lastSeed + '</span> — use this to replay the exact same run';
    endSeedEl.style.display = '';
  } else {
    endSeedEl.style.display = 'none';
  }
}


/* ==========================================================================
   8. ACHIEVEMENTS SYSTEM
   ========================================================================== */

// Achievement definitions
const ACHIEVEMENTS = [
  { id: 'soft_landing',    title: 'Soft Landing',        desc: 'End with avg inflation 1.5\u20132.5% AND avg unemployment 4.5\u20135.5%',   icon: '\uD83C\uDFAF' },
  { id: 'double_dip',      title: 'Double Dip',           desc: 'Unemployment exceeds 8% in two or more separate quarters',                icon: '\uD83D\uDCC9' },
  { id: 'hyperinflation',  title: 'Hyperinflation',       desc: 'Inflation exceeds 10% in any quarter',                                    icon: '\uD83D\uDD25' },
  { id: 'zero_bound',      title: 'Zero Bound Survivor',  desc: 'Hold the rate at 0.25% for 3+ consecutive quarters',                      icon: '\uD83D\uDD12' },
  { id: 'volcker',         title: 'The Volcker',           desc: 'Raise rates by a cumulative 3%+ in a single run',                         icon: '\uD83E\uDD85' },
  { id: 'steady_hand',     title: 'Steady Hand',           desc: 'Hold rates unchanged for 8+ consecutive quarters',                        icon: '\u270B' },
  { id: 'crisis_manager',  title: 'Crisis Manager',        desc: 'Survive 3 or more duration-3 shocks in a single run',                    icon: '\uD83D\uDEE1\uFE0F' },
  { id: 'policy_reversal', title: 'Policy Reversal',       desc: 'Change rate direction (up\u2194down) 4+ times in a run',                   icon: '\u2194\uFE0F' },
  { id: 'perfect_score',   title: 'Legendary Chair',       desc: 'Finish with a score of 95 or higher',                                    icon: '\uD83D\uDC51' },
  { id: 'deflation_scare', title: 'Deflation Scare',       desc: 'Inflation drops below 0% in any quarter',                                icon: '\uD83E\uDDCA' },
  { id: 'hot_economy',     title: 'Overheating',           desc: 'Inflation AND unemployment both exceed their targets by 2%+ simultaneously', icon: '\uD83D\uDCA5' },
  { id: 'full_term',       title: 'Full Term',              desc: 'Complete all 16 quarters of your chairmanship',                          icon: '\uD83D\uDCC5' },
  { id: 'crisis_mode_win', title: 'Crisis Survivor',       desc: 'Score 60+ while playing on Crisis Mode',                                 icon: '\u26A1' },
  { id: 'daily_challenge', title: 'Daily Challenger',      desc: 'Complete a Daily Challenge run',                                         icon: '\uD83D\uDCC6' }
];

/**
 * Unlock an achievement if not already unlocked, then show a toast.
 */
function unlockAchievement(id) {
  if (!state.unlockedAchievements) state.unlockedAchievements = [];
  if (state.unlockedAchievements.includes(id)) return;
  const achievement = ACHIEVEMENTS.find(a => a.id === id);
  if (!achievement) return;
  state.unlockedAchievements.push(id);
  showAchievementToast(achievement);
}

// Internal queue so multiple achievements firing at once don't overlap
let _toastQueue = [];
let _toastActive = false;

function showAchievementToast(achievement) {
  _toastQueue.push(achievement);
  if (!_toastActive) _processToastQueue();
}

function _processToastQueue() {
  if (_toastQueue.length === 0) { _toastActive = false; return; }
  _toastActive = true;
  const a = _toastQueue.shift();

  const toast    = document.getElementById('achievement-toast');
  const iconEl   = document.getElementById('achievement-icon');
  const titleEl  = document.getElementById('achievement-toast-title');
  const descEl   = document.getElementById('achievement-toast-desc');
  if (!toast || !iconEl || !titleEl || !descEl) { _toastActive = false; return; }

  iconEl.textContent  = a.icon  || '\u2605';
  titleEl.textContent = a.title || a.name || '';
  descEl.textContent  = a.desc  || '';

  toast.classList.remove('hidden', 'achievement-toast--out');
  toast.classList.add('achievement-toast--in');

  // Auto-dismiss after 3.5 s
  setTimeout(() => {
    toast.classList.remove('achievement-toast--in');
    toast.classList.add('achievement-toast--out');
    setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('achievement-toast--out');
      _processToastQueue(); // show next queued achievement
    }, 400); // matches CSS transition
  }, 3500);
}

/**
 * Called after each quarter (from makeDecision v2) to update stats and
 * check / fire in-game achievements.
 *
 * @param {object} record    - history record just logged (inflation, unemployment, rate…)
 * @param {number} rateDelta - rate change applied this quarter (+/-)
 */
function updateAchievementStats(record, rateDelta) {
  if (!state.achievementStats) return;
  const s = state.achievementStats;

  // --- Track extremes ---
  s.maxInflation = Math.max(s.maxInflation, record.inflation);
  s.minInflation = Math.min(s.minInflation, record.inflation);

  // --- Unemployment spikes ---
  if (record.unemployment > 8) s.unemploymentSpikes++;

  // --- Rate tracking ---
  if (rateDelta > 0) {
    s.totalRateRaised += rateDelta;
  } else if (rateDelta < 0) {
    s.totalRateLowered += Math.abs(rateDelta);
  }

  // --- Consecutive holds ---
  if (Math.abs(rateDelta) < 0.001) {
    s.consecutiveHolds++;
    s.maxConsecutiveHolds = Math.max(s.maxConsecutiveHolds, s.consecutiveHolds);
  } else {
    s.consecutiveHolds = 0;
  }

  // --- Low-rate (zero-bound) quarters ---
  if (record.rate <= RATE_MIN + 0.001) {
    s.lowRateQuarters++;
  } else {
    s.lowRateQuarters = 0; // must be consecutive
  }

  // --- Rate direction changes ---
  const dir = rateDelta > 0 ? 1 : rateDelta < 0 ? -1 : 0;
  if (dir !== 0 && s.lastRateDirection !== 0 && dir !== s.lastRateDirection) {
    s.rateDirectionChanges++;
  }
  if (dir !== 0) s.lastRateDirection = dir;

  // --- Duration-3 shocks ---
  const scheduledShock = state.shockSchedule ? state.shockSchedule[state.quarter - 1] : null;
  if (scheduledShock && scheduledShock.duration === 3) s.duration3ShocksCount++;

  // ── Check in-game (per-quarter) achievements ─────────────────────────────

  if (s.maxInflation > 10)
    unlockAchievement('hyperinflation');

  if (s.minInflation < 0)
    unlockAchievement('deflation_scare');

  if (s.unemploymentSpikes >= 2)
    unlockAchievement('double_dip');

  if (s.lowRateQuarters >= 3)
    unlockAchievement('zero_bound');

  if (s.totalRateRaised >= 3)
    unlockAchievement('volcker');

  if (s.maxConsecutiveHolds >= 8)
    unlockAchievement('steady_hand');

  if (s.duration3ShocksCount >= 3)
    unlockAchievement('crisis_manager');

  if (s.rateDirectionChanges >= 4)
    unlockAchievement('policy_reversal');

  // Overheating: both exceed target by 2%+
  if (record.inflation    > TARGET_INFLATION    + 2 &&
      record.unemployment > TARGET_UNEMPLOYMENT + 2)
    unlockAchievement('hot_economy');

  // Full term: completing the final quarter
  const limit = (state.totalQuarters != null) ? state.totalQuarters : TOTAL_QUARTERS;
  if (state.quarter >= limit)
    unlockAchievement('full_term');

}

/**
 * Check end-of-run achievements that require the final score.
 * Called from renderEndScreen (or after calcFinalScore resolves).
 * score-based achievements stay here so we don't conflict with T2 work.
 *
 * @param {number} finalScore - 0-100 score for this run
 */
function checkEndAchievements(finalScore) {
  if (!state.history || state.history.length === 0) return;

  // Soft landing: avg inflation 1.5-2.5% AND avg unemployment 4.5-5.5%
  const avgInfl  = state.history.reduce((s, r) => s + r.inflation,    0) / state.history.length;
  const avgUnemp = state.history.reduce((s, r) => s + r.unemployment, 0) / state.history.length;
  if (avgInfl >= 1.5 && avgInfl <= 2.5 && avgUnemp >= 4.5 && avgUnemp <= 5.5)
    unlockAchievement('soft_landing');

  // Perfect score
  if (finalScore >= 95)
    unlockAchievement('perfect_score');

  // Crisis Mode win
  const diffName = (typeof currentDifficulty !== 'undefined' && currentDifficulty)
    ? currentDifficulty.name : '';
  if (finalScore >= 60 && diffName === 'Crisis Mode')
    unlockAchievement('crisis_mode_win');

  // Daily Challenge completion
  if (state.isDailyChallenge)
    unlockAchievement('daily_challenge');
}

/**
 * Render earned achievements into the end screen achievements panel.
 * Safe to call even if the panel div is absent (no-ops gracefully).
 */
function renderEndAchievements() {
  const panel = document.getElementById('end-achievements-panel');
  if (!panel) return;

  const earned = (state.unlockedAchievements || [])
    .map(id => ACHIEVEMENTS.find(a => a.id === id))
    .filter(Boolean);

  if (earned.length === 0) {
    panel.innerHTML = '<p class="achievements-empty">No achievements earned this run.</p>';
    return;
  }

  panel.innerHTML =
    '<h3 class="achievements-heading">Achievements Earned</h3>' +
    '<div class="achievements-grid">' +
    earned.map(a =>
      '<div class="achievement-badge" title="' + a.title + ': ' + a.desc.replace(/"/g, '&quot;') + '" data-tooltip="' + a.title + ': ' + a.desc.replace(/"/g, '&quot;') + '">' +
        '<div class="achievement-badge-icon">' + a.icon + '</div>' +
        '<div class="achievement-badge-title">' + a.title + '</div>' +
      '</div>'
    ).join('') +
    '</div>';
}
