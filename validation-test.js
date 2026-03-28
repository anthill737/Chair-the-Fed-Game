/**
 * validation-test.js
 * T-07: Final deterministic simulation — 3 scenarios, ZERO noise
 *
 * Uses CURRENT app.js Real World constants exactly as committed.
 * Scenarios:
 *   1. hold@4.25  — player never moves from starting rate
 *   2. hold@5.25  — player sets rate to 5.25 Q1 then never moves
 *   3. active_mgmt — player adjusts each quarter toward inflation target
 *
 * Goal: confirm hold-steady scores POOR (<40) and active mgmt achieves GOOD+ (>70).
 */

// ── Constants — CURRENT app.js Real World defaults (as of commit 1a9612a) ─────
const TARGET_INFLATION    = 2.0;
const TARGET_UNEMPLOYMENT = 5.0;
const INIT_INFLATION      = 2.4;
const INIT_UNEMPLOYMENT   = 5.5;
const INIT_RATE           = 4.25;

const RATE_INFL_SENSITIVITY  = 0.26;
const RATE_UNEMP_SENSITIVITY = 0.20;
const LAG_IMMEDIATE          = 0.35;
const LAG_DEFERRED           = 0.65;

const INFL_MEAN_REVERT  = 0.03;
const UNEMP_MEAN_REVERT = 0.02;
const INFL_DRIFT_BIAS   = 0.08;
const UNEMP_DRIFT_BIAS  = -0.03;

const NEUTRAL_RATE           = 4.0;
const RATE_INFL_LEVEL_COEFF  = 0.40;
const RATE_UNEMP_LEVEL_COEFF = 0.20;

const INFL_MIN  = -1.0;
const INFL_MAX  = 15.0;
const UNEMP_MIN = 2.0;
const UNEMP_MAX = 15.0;

const RATE_MIN  = 0.25;
const RATE_MAX  = 10.0;
const RATE_STEP = 0.25;

const MAX_AVG_PENALTY = 2.5;
const TOTAL_QUARTERS  = 16;

// ── Helpers ────────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function roundTo(v, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

/**
 * Advance the economy by one quarter.
 * Mirrors advanceEconomy() in app.js exactly — no shocks, no noise.
 */
function advanceEconomy({ inflation, unemployment, fedRate, lagInflEffect, lagUnempEffect, rateDelta }) {
  // 1. Immediate policy effect (35%)
  const directInfl  = -rateDelta * RATE_INFL_SENSITIVITY  * LAG_IMMEDIATE;
  const directUnemp = +rateDelta * RATE_UNEMP_SENSITIVITY * LAG_IMMEDIATE;

  // 2. Deferred lag from previous quarter's decision
  const lagInfl  = lagInflEffect;
  const lagUnemp = lagUnempEffect;

  // 3. Structural drift
  const driftInfl  = INFL_DRIFT_BIAS;
  const driftUnemp = UNEMP_DRIFT_BIAS;

  // 4. Weak mean reversion
  const pullInfl  = (TARGET_INFLATION    - inflation)    * INFL_MEAN_REVERT;
  const pullUnemp = (TARGET_UNEMPLOYMENT - unemployment) * UNEMP_MEAN_REVERT;

  // 5. Rate-level effect
  const rateGap    = fedRate - NEUTRAL_RATE;
  const levelInfl  = -rateGap * RATE_INFL_SENSITIVITY  * RATE_INFL_LEVEL_COEFF;
  const levelUnemp = +rateGap * RATE_UNEMP_SENSITIVITY * RATE_UNEMP_LEVEL_COEFF;

  // 6. No shocks, no noise (deterministic validation)
  const inflDelta  = directInfl  + lagInfl  + driftInfl  + pullInfl  + levelInfl;
  const unempDelta = directUnemp + lagUnemp + driftUnemp + pullUnemp + levelUnemp;

  const newInflation    = roundTo(clamp(inflation    + inflDelta,  INFL_MIN,  INFL_MAX),  2);
  const newUnemployment = roundTo(clamp(unemployment + unempDelta, UNEMP_MIN, UNEMP_MAX), 2);

  // Store deferred lag for next quarter
  const nextLagInfl  = -rateDelta * RATE_INFL_SENSITIVITY  * LAG_DEFERRED;
  const nextLagUnemp = +rateDelta * RATE_UNEMP_SENSITIVITY * LAG_DEFERRED;

  return { newInflation, newUnemployment, nextLagInfl, nextLagUnemp, inflDelta, unempDelta };
}

/**
 * Run a full 16-quarter simulation.
 * @param {function} ratePolicy - (q, inflation, unemployment, fedRate) => rateDelta
 * @param {string}   label
 * @param {number}   [startRate=INIT_RATE]
 */
function runScenario(label, ratePolicy, startRate = INIT_RATE) {
  let inflation    = INIT_INFLATION;
  let unemployment = INIT_UNEMPLOYMENT;
  let fedRate      = startRate;
  let lagInflEffect  = 0;
  let lagUnempEffect = 0;
  let totalPenalty   = 0;

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  SCENARIO: ${label}`);
  console.log(`${'═'.repeat(72)}`);
  console.log(
    ' Q'.padEnd(4),
    'Infl%'.padStart(7),
    'Unemp%'.padStart(8),
    'Rate%'.padStart(7),
    'dInfl'.padStart(8),
    'dUnemp'.padStart(9),
    'Penalty'.padStart(9)
  );
  console.log('─'.repeat(56));

  const quarterData = [];

  for (let q = 1; q <= TOTAL_QUARTERS; q++) {
    const rateDelta = ratePolicy(q, inflation, unemployment, fedRate);

    // Clamp new rate to bounds
    const newRate = clamp(fedRate + rateDelta, RATE_MIN, RATE_MAX);
    // Actual delta after clamping (round to nearest RATE_STEP)
    const actualDelta = roundTo(newRate - fedRate, 2);

    const result = advanceEconomy({
      inflation, unemployment, fedRate: newRate, lagInflEffect, lagUnempEffect,
      rateDelta: actualDelta
    });

    const { newInflation, newUnemployment, nextLagInfl, nextLagUnemp, inflDelta, unempDelta } = result;

    const penalty = Math.abs(newInflation - TARGET_INFLATION) + Math.abs(newUnemployment - TARGET_UNEMPLOYMENT);
    totalPenalty += penalty;

    quarterData.push({ q, inflation: newInflation, unemployment: newUnemployment, fedRate: newRate, penalty });

    console.log(
      ` Q${q}`.padEnd(4),
      `${newInflation.toFixed(2)}%`.padStart(7),
      `${newUnemployment.toFixed(2)}%`.padStart(8),
      `${newRate.toFixed(2)}%`.padStart(7),
      `${inflDelta >= 0 ? '+' : ''}${inflDelta.toFixed(3)}`.padStart(8),
      `${unempDelta >= 0 ? '+' : ''}${unempDelta.toFixed(3)}`.padStart(9),
      `${penalty.toFixed(3)}`.padStart(9)
    );

    // Advance state
    fedRate      = newRate;
    inflation    = newInflation;
    unemployment = newUnemployment;
    lagInflEffect  = nextLagInfl;
    lagUnempEffect = nextLagUnemp;
  }

  console.log('─'.repeat(56));

  const avgPenalty = totalPenalty / TOTAL_QUARTERS;
  const score = Math.max(0, Math.round(100 - (avgPenalty / MAX_AVG_PENALTY) * 100));
  const tier = score >= 80 ? 'EXCELLENT (≥80)'
             : score >= 60 ? 'GOOD (≥60)'
             : score >= 40 ? 'ACCEPTABLE (≥40)'
             : 'POOR (<40) ✓ FAILURE CONDITION MET';

  console.log(`  Total penalty : ${totalPenalty.toFixed(4)}`);
  console.log(`  Avg penalty   : ${avgPenalty.toFixed(4)}`);
  console.log(`  Score         : ${score} / 100`);
  console.log(`  Tier          : ${tier}`);

  return { label, avgPenalty, score, tier, quarterData };
}

// ── Scenario 1: Hold at 4.25 forever ─────────────────────────────────────────
// Player never changes rate from the initial 4.25% starting value.
// Expected: economy drifts, score POOR (<40).

const s1 = runScenario(
  'HOLD@4.25 — player never moves from starting rate (no noise)',
  () => 0,           // rateDelta = 0 every quarter
  INIT_RATE          // start at 4.25
);

// ── Scenario 2: Move to 5.25 in Q1 then hold ─────────────────────────────────
// Player makes one +1.0 move then freezes.
// Slightly higher rate — level effect stronger — but still not actively managed.
// Expected: inflation stabilises more but unemployment rises; score likely POOR or ACCEPTABLE.

const s2 = runScenario(
  'HOLD@5.25 — one initial move (+1.0) then hold forever (no noise)',
  (q) => q === 1 ? 1.0 : 0,   // +1.0 only on Q1
  INIT_RATE
);

// ── Scenario 3: Active management — simple proportional policy rule ───────────
// Player adjusts rate each quarter based on inflation gap:
//   rateDelta = k * (inflation - TARGET_INFLATION)
// This models a basic Taylor-rule-style responder.
// Expected: keeps values near targets; score GOOD or EXCELLENT (≥70).

const ACTIVE_K = 0.5;  // proportional gain on inflation gap

const s3 = runScenario(
  `ACTIVE MGMT — proportional rule rateDelta=${ACTIVE_K}×(infl−${TARGET_INFLATION}) (no noise)`,
  (q, inflation, unemployment, fedRate) => {
    const inflGap  = inflation    - TARGET_INFLATION;
    const unempGap = unemployment - TARGET_UNEMPLOYMENT;
    // Lean against inflation; also ease if unemployment too high
    const raw = ACTIVE_K * inflGap - 0.2 * unempGap;
    // Quantise to nearest RATE_STEP
    return roundTo(Math.round(raw / RATE_STEP) * RATE_STEP, 2);
  },
  INIT_RATE
);

// ── Summary ────────────────────────────────────────────────────────────────────

console.log('\n' + '█'.repeat(72));
console.log('  T-07 VALIDATION SUMMARY');
console.log('█'.repeat(72));
console.log('');
console.log('  Scenario'.padEnd(52), 'Score'.padStart(7), '  Tier');
console.log('  ' + '─'.repeat(68));

for (const s of [s1, s2, s3]) {
  const pass = s === s3 ? s.score >= 70 : s.score < 40;
  const flag = pass ? '✓' : '✗ NEEDS ATTENTION';
  console.log(`  ${s.label.slice(0, 50).padEnd(50)}  ${String(s.score).padStart(5)}    ${flag}`);
}

console.log('');
console.log('  Validation criteria:');
console.log('    • Hold@4.25 score < 40  (FAILURE CONDITION — economy drifts)');
console.log('    • Hold@5.25 score < 40  (FAILURE CONDITION — partial response)');
console.log('    • Active mgmt score ≥ 70 (confirms policy CAN win if applied correctly)');

const holdPass = s1.score < 40 && s2.score < 40;
const activePass = s3.score >= 70;

console.log('');
console.log(`  Hold-steady gate : ${holdPass  ? '✓ PASS' : '✗ FAIL — constants need further calibration'}`);
console.log(`  Active-play gate : ${activePass ? '✓ PASS' : '✗ FAIL — game may be too hard or policy too weak'}`);
console.log('');

if (!holdPass || !activePass) {
  console.log('  ⚠  One or more validation gates FAILED.');
  console.log('     Escalate to Coordinator for constant recalibration (T-03).');
} else {
  console.log('  ✓  All gates passed. Current constants are correctly calibrated.');
  console.log('     No changes to app.js constants are required.');
}
