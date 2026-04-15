/* ==========================================================================
   CHAIR THE FED — engine.js
   Pure simulation logic. No DOM dependencies.

   Exports (vanilla ES5 globals):
     DIFFICULTY_PRESETS      — tuning constants per difficulty mode
     mulberry32(seed)        — seeded PRNG factory
     stepEconomy(...)        — quarterly economic update (pure function)
     penaltyToScore(...)     — convert average penalty to 0-100 score
     getInitialConditions(d) — starting economic state per difficulty
     hashString(str)         — FNV-1a string → uint32
     getDailySeed()          — date-based seed for daily challenge
     calcQuarterPenalty(...) — per-quarter scoring helper
     calcFinalScore(history) — end-game score from history array
     getOutcomeVerdict(score)— verdict title/text/className for end screen
     checkSoftLanding(hist)  — true if all quarters near both targets
     findBestWorstQuarters(h)— { best, worst } quarter objects
     createInitialState(s,d) — create fresh game state (stateful API)
     makeDecision(state,act) — advance state by one quarter (stateful API)
     calculateFinalScore(st) — 0-100 score from state (stateful API)
   ========================================================================== */


/* --------------------------------------------------------------------------
   TUNING TARGETS — used inside stepEconomy for mean reversion
   -------------------------------------------------------------------------- */
var ENGINE_TARGET_INFLATION    = 2.0;
var ENGINE_TARGET_UNEMPLOYMENT = 5.0;


/* --------------------------------------------------------------------------
   1. DIFFICULTY PRESETS
   Each preset is a bag of named tuning constants.
   All builders should reference these by name, not hardcoded numbers.

   noise            — half-range of per-quarter random variation (±noise)
   momentum         — fraction of last quarter's Δ that carries forward
   meanRevert       — pull strength toward natural targets each quarter
   rateSensitivity  — how strongly a 1% rate move shifts the economy
   lagImmediate     — fraction of policy effect applied in the current quarter
   lagDeferred      — fraction of policy effect held over to the next quarter
   eventFreq        — probability [0,1) of a random event occurring each quarter
   -------------------------------------------------------------------------- */
var DIFFICULTY_PRESETS = {
  textbook: {
    noise:           0.08,   // unchanged — noise stays controlled
    momentum:        0.28,   // +15% responsiveness bump: was 0.24
    meanRevert:      0.10,
    rateSensitivity: 0.48,   // +15% responsiveness bump: was 0.42
    lagImmediate:    0.45,
    lagDeferred:     0.55,
    eventFreq:       0.12
  },
  realworld: {
    noise:           0.15,   // unchanged
    momentum:        0.41,   // +15% responsiveness bump: was 0.36
    meanRevert:      0.06,
    rateSensitivity: 0.69,   // +15% responsiveness bump: was 0.60
    lagImmediate:    0.45,
    lagDeferred:     0.55,
    eventFreq:       0.20
  },
  crisis: {
    noise:           0.25,   // unchanged
    momentum:        0.55,   // +15% responsiveness bump: was 0.48
    meanRevert:      0.03,
    rateSensitivity: 0.90,   // +15% responsiveness bump: was 0.78
    lagImmediate:    0.45,
    lagDeferred:     0.55,
    eventFreq:       0.30
  }
};


/* --------------------------------------------------------------------------
   2. SEEDED PRNG — mulberry32
   Returns a stateful function that yields floats in [0, 1).
   Deterministic for a given seed — same seed → same sequence every time.
   -------------------------------------------------------------------------- */
function mulberry32(seed) {
  var s = seed >>> 0; // coerce to unsigned 32-bit integer
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


/* --------------------------------------------------------------------------
   3. QUARTERLY ECONOMIC UPDATE — stepEconomy
   Called once per quarter after the player sets the rate.

   Parameters
   ----------
   prevInfl      : number  — inflation at end of last quarter (%)
   prevUnemp     : number  — unemployment at end of last quarter (%)
   rateChange    : number  — player's rate decision this quarter (Δ%, e.g. +0.25 / -0.25 / 0)
   lagInflEffect : number  — deferred inflation effect carried forward from last quarter
   lagUnempEffect: number  — deferred unemployment effect carried forward from last quarter
   inflMom       : number  — momentum: last quarter's inflation change (Δ)
   unempMom      : number  — momentum: last quarter's unemployment change (Δ)
   event         : object|null — { inflEffect: number, unempEffect: number } or null
   diff          : object  — one of DIFFICULTY_PRESETS.{textbook|realworld|crisis}
   rng           : function — seeded PRNG from mulberry32()

   Returns
   -------
   {
     newInfl       : number  — inflation after this quarter's update
     newUnemp      : number  — unemployment after this quarter's update
     nextLagInfl   : number  — deferred inflation effect to carry into next quarter
     nextLagUnemp  : number  — deferred unemployment effect to carry into next quarter
     newInflMom    : number  — updated inflation momentum (Δ this quarter)
     newUnempMom   : number  — updated unemployment momentum (Δ this quarter)
   }

   Formula (all components are additive deltas):
   ─────────────────────────────────────────────
   Full policy effect on inflation    = rateChange * rateSensitivity * -1
     (raising the rate pushes inflation down)
   Full policy effect on unemployment = rateChange * rateSensitivity * +0.5
     (raising the rate pushes unemployment up)

   Immediate portion (applied now)  = full effect * lagImmediate
   Deferred portion (applied later) = full effect * lagDeferred → nextLag*

   Mean reversion = (target - current) * meanRevert
     (gentle pull back toward 2% inflation, 5% unemployment)

   Momentum = previousΔ * momentum
     (trends carry forward partially)

   Noise = (rng() - 0.5) * 2 * noise
     (symmetric random variation each quarter)

   Event = event.inflEffect / event.unempEffect (if event != null)

   Final delta = immediate + lag-from-last-quarter + meanReversion + momentum + noise + event
   -------------------------------------------------------------------------- */
function stepEconomy(
  prevInfl, prevUnemp,
  rateChange,
  lagInflEffect, lagUnempEffect,
  inflMom, unempMom,
  event,
  diff, rng
) {
  // --- Policy transmission ---
  // Full effect if rateChange were applied with no lag
  var fullInflEffect  = rateChange * diff.rateSensitivity * -1;   // raise → lower infl
  var fullUnempEffect = rateChange * diff.rateSensitivity * 0.5;  // raise → higher unemp

  // Immediate portion hits this quarter; deferred portion saved for next quarter
  var immediateInfl  = fullInflEffect  * diff.lagImmediate;
  var immediateUnemp = fullUnempEffect * diff.lagImmediate;
  var nextLagInfl    = fullInflEffect  * diff.lagDeferred;
  var nextLagUnemp   = fullUnempEffect * diff.lagDeferred;

  // --- Mean reversion (light pull toward natural targets) ---
  var inflRevert  = (ENGINE_TARGET_INFLATION    - prevInfl)  * diff.meanRevert;
  var unempRevert = (ENGINE_TARGET_UNEMPLOYMENT - prevUnemp) * diff.meanRevert;

  // --- Momentum (trends persist) ---
  var inflMomContrib  = inflMom  * diff.momentum;
  var unempMomContrib = unempMom * diff.momentum;

  // --- Random noise (symmetric, controlled) ---
  var inflNoise  = (rng() - 0.5) * 2 * diff.noise;
  var unempNoise = (rng() - 0.5) * 2 * diff.noise;

  // --- Event shocks (optional) ---
  // Support both naming conventions: inflShock (events.js) and inflEffect (legacy)
  var eventInfl  = event ? (event.inflShock  || event.inflEffect  || 0) : 0;
  var eventUnemp = event ? (event.unempShock || event.unempEffect || 0) : 0;

  // --- Combine all deltas ---
  var inflDelta  = immediateInfl  + lagInflEffect  + inflRevert  + inflMomContrib  + inflNoise  + eventInfl;
  var unempDelta = immediateUnemp + lagUnempEffect + unempRevert + unempMomContrib + unempNoise + eventUnemp;

  // --- Apply and clamp ---
  var newInfl  = Math.max(-2,  Math.min(15, prevInfl  + inflDelta));
  var newUnemp = Math.max(0,   Math.min(20, prevUnemp + unempDelta));

  // --- Update momentum (actual change this quarter) ---
  var newInflMom  = newInfl  - prevInfl;
  var newUnempMom = newUnemp - prevUnemp;

  return {
    newInfl:      newInfl,
    newUnemp:     newUnemp,
    nextLagInfl:  nextLagInfl,
    nextLagUnemp: nextLagUnemp,
    newInflMom:   newInflMom,
    newUnempMom:  newUnempMom
  };
}


/* --------------------------------------------------------------------------
   4. SCORING — penaltyToScore
   Each quarter: penalty = |inflation - 2| + |unemployment - 5|
   At end: avgPenalty = sum of all quarter penalties / 16

   score = max(0, round(100 - (avgPenalty / 5) * 100))

   Interpretation:
     avgPenalty = 0  → score 100 (perfect)
     avgPenalty = 5  → score 0   (both targets missed by 2.5% each, every quarter)
   -------------------------------------------------------------------------- */
function penaltyToScore(avgPenalty) {
  return Math.max(0, Math.round(100 - (avgPenalty / 5) * 100));
}


/* --------------------------------------------------------------------------
   5. INITIAL CONDITIONS
   All difficulties start near their policy targets with slight randomness.
   When rng is provided (seeded PRNG from mulberry32), values are randomized
   within the realistic near-target ranges below so every seed feels fresh.
   When rng is omitted, midpoint defaults are returned (used for display labels).

   Ranges:
     Inflation    [1.8, 2.4]  % — near 2% target
     Unemployment [4.8, 5.6]  % — near 5% natural rate
     Fed Funds    [3.0, 5.0]  % — rounded to nearest 0.25 step
   -------------------------------------------------------------------------- */
function getInitialConditions(difficulty, rng) {
  // Midpoint defaults (used when rng is not provided)
  var INFL_MID  = 2.1;
  var UNEMP_MID = 5.2;
  var RATE_MID  = 4.0;

  var infl, unemp, rate;

  if (rng) {
    // Randomize within near-target ranges
    infl  = 1.8 + rng() * 0.6;        // [1.8, 2.4]
    unemp = 4.8 + rng() * 0.8;        // [4.8, 5.6]
    rate  = 3.0 + rng() * 2.0;        // [3.0, 5.0]
    // Round to clean display values
    infl  = Math.round(infl  * 10) / 10;                  // nearest 0.1%
    unemp = Math.round(unemp * 10) / 10;                  // nearest 0.1%
    rate  = Math.round(rate  * 4)  / 4;                   // nearest 0.25%
  } else {
    infl  = INFL_MID;
    unemp = UNEMP_MID;
    rate  = RATE_MID;
  }

  return { inflation: infl, unemployment: unemp, fedRate: rate };
}


/* --------------------------------------------------------------------------
   6. HASH STRING → uint32
   Converts an arbitrary string to a uint32 seed.
   Enables string-based seeds (e.g. "abc123", ISO date strings).
   -------------------------------------------------------------------------- */
function hashString(str) {
  var hash = 0x811C9DC5; // FNV-1a offset basis
  for (var i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (Math.imul(hash, 0x01000193)) >>> 0; // FNV prime, force uint32
  }
  return hash >>> 0;
}


/* --------------------------------------------------------------------------
   7. DAILY CHALLENGE SEED
   Encodes today's date as an integer: YYYYMMDD.
   Same seed for every player on the same calendar day.
   -------------------------------------------------------------------------- */
function getDailySeed() {
  var d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}


/* --------------------------------------------------------------------------
   8. EXTENDED SCORING HELPERS
   These supplement penaltyToScore() with richer end-screen analytics.
   -------------------------------------------------------------------------- */

/**
 * Quarter penalty = |inflation - 2| + |unemployment - 5|
 * Used to build the score history each quarter.
 */
function calcQuarterPenalty(inflation, unemployment) {
  return Math.abs(inflation - ENGINE_TARGET_INFLATION) +
         Math.abs(unemployment - ENGINE_TARGET_UNEMPLOYMENT);
}

/**
 * Final score from full history array.
 * history: array of objects with { inflation, unemployment } fields.
 * Returns 0-100 integer.
 */
function calcFinalScore(history) {
  if (!history || history.length === 0) return 0;
  var total = 0;
  for (var i = 0; i < history.length; i++) {
    total += calcQuarterPenalty(history[i].inflation, history[i].unemployment);
  }
  var avgPenalty = total / history.length;
  return Math.max(0, Math.min(100, Math.round(100 - avgPenalty * 20)));
}

/**
 * Map a 0-100 score to a verdict object.
 * Returns { title: string, text: string, className: string }
 */
function getOutcomeVerdict(score) {
  var tiers = [
    { min: 95, title: 'Legendary Chair',         text: 'Mandate Fully Achieved',               className: 'excellent' },
    { min: 85, title: 'Mandate Achieved',        text: 'Textbook Policy',                      className: 'excellent' }, // coordinator decision: 85+ is excellent (green)
    { min: 75, title: 'Steady Hand',             text: 'Economy Stabilized',                   className: 'good'      },
    { min: 60, title: 'Reappointed',             text: 'Mixed but Acceptable',                 className: 'good'      },
    { min: 40, title: 'Not Reappointed',         text: 'Policy Fell Short',                    className: 'poor'      },
    { min: 20, title: 'Policy Disaster',         text: 'Stagflation Spiral',                   className: 'fired'     },
    { min:  0, title: 'Worst Chair in Fed History', text: 'Catastrophic Policy Failure',       className: 'fired'     }
  ];
  for (var i = 0; i < tiers.length; i++) {
    if (score >= tiers[i].min) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

/**
 * Returns true if EVERY quarter in history has:
 *   inflation in [1.5, 2.5]  AND  unemployment in [4.0, 6.0]
 * history: array of { inflation, unemployment } objects
 */
function checkSoftLanding(history) {
  if (!history || history.length === 0) return false;
  for (var i = 0; i < history.length; i++) {
    var r = history[i];
    if (r.inflation    < 1.5 || r.inflation    > 2.5) return false;
    if (r.unemployment < 4.0 || r.unemployment > 6.0) return false;
  }
  return true;
}

/**
 * Find the best and worst quarters by penalty.
 * history: array of { quarter, inflation, unemployment } objects
 * Returns { best: { quarter, penalty }, worst: { quarter, penalty } }
 */
function findBestWorstQuarters(history) {
  if (!history || history.length === 0) {
    return { best: null, worst: null };
  }
  var best  = null;
  var worst = null;
  for (var i = 0; i < history.length; i++) {
    var p = calcQuarterPenalty(history[i].inflation, history[i].unemployment);
    if (best  === null || p < best.penalty)  best  = { quarter: history[i].quarter, penalty: p };
    if (worst === null || p > worst.penalty) worst = { quarter: history[i].quarter, penalty: p };
  }
  return { best: best, worst: worst };
}


/* --------------------------------------------------------------------------
   9. HIGH-LEVEL STATEFUL API
   Used by the smoke test and optionally by app.js.

   createInitialState(seed, difficulty) → state
   makeDecision(state, action)          → state   (action: 'hold'|'raise'|'lower')
   calculateFinalScore(state)           → number 0-100

   State shape:
   {
     quarter      : number      — quarters completed so far (0 = before first decision)
     inflation    : number      — current inflation (%)
     unemployment : number      — current unemployment (%)
     fedRate      : number      — current fed funds rate (%)
     lagInflEffect : number     — deferred infl effect to apply next quarter
     lagUnempEffect: number     — deferred unemp effect to apply next quarter
     inflMom      : number      — last quarter's inflation change (momentum)
     unempMom     : number      — last quarter's unemployment change (momentum)
     diff         : object      — DIFFICULTY_PRESETS entry in use
     rng          : function    — stateful PRNG from mulberry32(seed)
     history      : Array       — one entry per completed quarter
   }
   -------------------------------------------------------------------------- */

// ENGINE_RATE_STEP prefixed to avoid conflict with app.js const RATE_STEP
var ENGINE_RATE_STEP      = 0.25;
var ENGINE_RATE_CLAMP_MIN = 0.0;
var ENGINE_RATE_CLAMP_MAX = 20.0;

/**
 * Map 'normal' (legacy alias) → 'realworld', then look up DIFFICULTY_PRESETS.
 * Falls back to 'realworld' for any unrecognised key.
 */
function resolveDifficulty(key) {
  if (key === 'normal') key = 'realworld';
  return DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS.realworld;
}

/**
 * Create a fresh engine-level game state (for headless/smoke-test use).
 * App.js uses its own createInitialState() with DOM-aware fields.
 * @param {number}  seed       — integer seed for the PRNG (use getDailySeed() for daily challenge)
 * @param {string}  difficulty — 'textbook' | 'realworld' | 'crisis' | 'normal' (alias for realworld)
 * @returns {object} Initial game state
 */
function engineCreateState(seed, difficulty) {
  var diff  = resolveDifficulty(difficulty || 'realworld');
  var rng   = mulberry32(seed || getDailySeed());
  var ic    = getInitialConditions(difficulty || 'realworld', rng);  // rng consumed for starting values
  return {
    quarter:       0,
    inflation:     ic.inflation,
    unemployment:  ic.unemployment,
    fedRate:       ic.fedRate,
    lagInflEffect:  0,
    lagUnempEffect: 0,
    inflMom:       0,
    unempMom:      0,
    diff:          diff,
    rng:           rng,
    history:       []
  };
}

/**
 * Advance the engine state by one quarter (for headless/smoke-test use).
 * App.js has its own makeDecision() UI function.
 * @param {object} state  — current engine state
 * @param {string} action — 'hold' | 'raise' | 'lower'
 * @returns {object} New engine state after applying the decision
 */
function engineMakeDecision(state, action) {
  var rateChange = 0;
  if (action === 'raise') rateChange =  ENGINE_RATE_STEP;
  if (action === 'lower') rateChange = -ENGINE_RATE_STEP;

  var newFedRate      = Math.max(ENGINE_RATE_CLAMP_MIN, Math.min(ENGINE_RATE_CLAMP_MAX,
                          Math.round((state.fedRate + rateChange) * 100) / 100));
  var actualRateChange = Math.round((newFedRate - state.fedRate) * 100) / 100;

  var result = stepEconomy(
    state.inflation,
    state.unemployment,
    actualRateChange,
    state.lagInflEffect,
    state.lagUnempEffect,
    state.inflMom,
    state.unempMom,
    null,         // event handled by events.js; pass null here for headless tests
    state.diff,
    state.rng
  );

  var newQuarter = state.quarter + 1;
  var historyEntry = {
    quarter:      newQuarter,
    inflation:    result.newInfl,
    unemployment: result.newUnemp,
    rate:         newFedRate,
    action:       action
  };

  return {
    quarter:        newQuarter,
    inflation:      result.newInfl,
    unemployment:   result.newUnemp,
    fedRate:        newFedRate,
    lagInflEffect:  result.nextLagInfl,
    lagUnempEffect: result.nextLagUnemp,
    inflMom:        result.newInflMom,
    unempMom:       result.newUnempMom,
    diff:           state.diff,
    rng:            state.rng,
    history:        state.history.concat([historyEntry])
  };
}

/**
 * Compute final score (0-100) from a completed game state.
 * @param {object} state — game state with history array
 * @returns {number} Score 0-100
 */
function calculateFinalScore(engineState) {
  return calcFinalScore(engineState.history);
}
