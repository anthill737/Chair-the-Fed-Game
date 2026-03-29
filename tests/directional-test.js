/**
 * tests/directional-test.js
 *
 * Directional correctness verification for engine.js.
 * Validates that the economic model responds in the right direction to policy.
 *
 * Strategies tested:
 *   A. Always RAISE  (+0.25 each quarter) → final inflation should be LOWER
 *   B. Always LOWER  (-0.25 each quarter) → final inflation should be HIGHER
 *   C. Always HOLD   (no change)          → score in the middle
 *
 * Also checks:
 *   - Raising rates increases unemployment (sacrifice)
 *   - Lowering rates decreases unemployment
 *
 * Usage:
 *   node tests/directional-test.js
 *
 * Exit code 0 = all directional checks pass
 * Exit code 1 = one or more checks failed
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ---------------------------------------------------------------------------
// Load engine.js into a vm sandbox
// ---------------------------------------------------------------------------

function loadEngine() {
  const enginePath = path.join(__dirname, '..', 'engine.js');
  if (!fs.existsSync(enginePath)) {
    console.error('FATAL: engine.js not found at', enginePath);
    process.exit(1);
  }
  const code    = fs.readFileSync(enginePath, 'utf8');
  const sandbox = { Math, console, module: { exports: {} }, exports: {} };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

const engine = loadEngine();
const { DIFFICULTY_PRESETS, mulberry32, stepEconomy, calcFinalScore } = engine;

// Verify required exports
['DIFFICULTY_PRESETS', 'mulberry32', 'stepEconomy', 'calcFinalScore'].forEach(function(name) {
  if (typeof engine[name] === 'undefined') {
    console.error('FATAL: engine.js missing export:', name);
    process.exit(1);
  }
});

// ---------------------------------------------------------------------------
// Simulation runner
// ---------------------------------------------------------------------------

/**
 * Run a 16-quarter simulation with a fixed per-quarter rate change.
 * @param {number}  rateChange   — e.g. +0.25, -0.25, or 0
 * @param {string}  difficulty   — 'textbook' | 'realworld' | 'crisis'
 * @param {number}  seed         — integer seed for reproducible results
 * @param {object}  initialCond  — { inflation, unemployment, fedRate }
 * @returns {{ history, initial, final, score }}
 */
function runSim(rateChange, difficulty, seed, initialCond) {
  var diff = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.realworld;
  var rng  = mulberry32(seed);

  var infl     = initialCond.inflation;
  var unemp    = initialCond.unemployment;
  var lagInfl  = 0;
  var lagUnemp = 0;
  var inflMom  = 0;
  var unempMom = 0;

  var history = [];

  for (var q = 1; q <= 16; q++) {
    var result = stepEconomy(
      infl, unemp,
      rateChange,
      lagInfl, lagUnemp,
      inflMom, unempMom,
      null,    // no events — isolates policy effect
      diff, rng
    );

    infl     = result.newInfl;
    unemp    = result.newUnemp;
    lagInfl  = result.nextLagInfl;
    lagUnemp = result.nextLagUnemp;
    inflMom  = result.newInflMom;
    unempMom = result.newUnempMom;

    history.push({ quarter: q, inflation: infl, unemployment: unemp });
  }

  return {
    history:  history,
    initial:  { inflation: initialCond.inflation, unemployment: initialCond.unemployment },
    final:    { inflation: infl, unemployment: unemp },
    score:    calcFinalScore(history)
  };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

var passed = 0;
var failed = 0;

function assert(condition, label, actual) {
  if (condition) {
    console.log('  PASS:', label);
    passed++;
  } else {
    var suffix = actual !== undefined ? ' (got: ' + JSON.stringify(actual) + ')' : '';
    console.error('  FAIL:', label + suffix);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Run simulations
// ---------------------------------------------------------------------------

var SEED = 42;
var DIFF = 'realworld';
var IC   = { inflation: 3.5, unemployment: 6.5, fedRate: 1.0 };
// Start with high inflation, high unemployment to give raise/lower room to work

console.log('\n=== Directional Correctness Test ===');
console.log('Difficulty:', DIFF, '| Seed:', SEED);
console.log('Initial conditions: inflation=' + IC.inflation + '%, unemployment=' + IC.unemployment + '%\n');

var simRaise = runSim(+0.25, DIFF, SEED, IC);
var simLower = runSim(-0.25, DIFF, SEED, IC);
var simHold  = runSim( 0,    DIFF, SEED, IC);

// ---------------------------------------------------------------------------
// Print results table
// ---------------------------------------------------------------------------

function fmt2(n) { return n.toFixed(2); }

console.log('Strategy     | Initial Infl | Final Infl | Δ Infl  | Initial Unemp | Final Unemp | Δ Unemp | Score');
console.log('-------------|--------------|------------|---------|---------------|-------------|---------|------');

[
  { label: 'Always RAISE', sim: simRaise },
  { label: 'Always LOWER', sim: simLower },
  { label: 'Always HOLD ', sim: simHold  }
].forEach(function(row) {
  var s  = row.sim;
  var di = s.final.inflation    - s.initial.inflation;
  var du = s.final.unemployment - s.initial.unemployment;
  console.log(
    row.label + ' | ' +
    fmt2(s.initial.inflation)    + '%         | ' +
    fmt2(s.final.inflation)      + '%     | ' +
    (di >= 0 ? '+' : '') + fmt2(di) + '  | ' +
    fmt2(s.initial.unemployment) + '%          | ' +
    fmt2(s.final.unemployment)   + '%       | ' +
    (du >= 0 ? '+' : '') + fmt2(du) + ' | ' +
    s.score
  );
});

console.log('\nFinal Scores: RAISE=' + simRaise.score + '  LOWER=' + simLower.score + '  HOLD=' + simHold.score);

// ---------------------------------------------------------------------------
// Directional assertions
// ---------------------------------------------------------------------------

console.log('\n── Directional Checks ──\n');

// Inflation direction
assert(
  simRaise.final.inflation < simRaise.initial.inflation,
  'Always-Raise: final inflation is LOWER than initial',
  { initial: simRaise.initial.inflation, final: simRaise.final.inflation }
);

assert(
  simLower.final.inflation > simLower.initial.inflation,
  'Always-Lower: final inflation is HIGHER than initial',
  { initial: simLower.initial.inflation, final: simLower.final.inflation }
);

// Unemployment direction (Phillips curve tradeoff)
assert(
  simRaise.final.unemployment >= simHold.final.unemployment,
  'Always-Raise: unemployment equal or higher than Hold (tightening sacrifices jobs)',
  { raise: simRaise.final.unemployment, hold: simHold.final.unemployment }
);

assert(
  simLower.final.unemployment <= simHold.final.unemployment,
  'Always-Lower: unemployment equal or lower than Hold (easing supports jobs)',
  { lower: simLower.final.unemployment, hold: simHold.final.unemployment }
);

// Inflation ordering: raise < hold < lower (over 16 quarters)
assert(
  simRaise.final.inflation < simHold.final.inflation,
  'Raise ends with lower inflation than Hold',
  { raise: simRaise.final.inflation, hold: simHold.final.inflation }
);

assert(
  simHold.final.inflation < simLower.final.inflation,
  'Hold ends with lower inflation than Lower',
  { hold: simHold.final.inflation, lower: simLower.final.inflation }
);

// Score sanity: raising from high inflation should score well
assert(
  simRaise.score >= 0 && simRaise.score <= 100,
  'Always-Raise score is in range [0, 100]',
  simRaise.score
);

// ---------------------------------------------------------------------------
// ── SECTION 2: Advisor Disagreement Tests ────────────────────────────────
// Load events.js and verify per-advisor personality divergence.
// NOTE: Tests 2a and 2b target post-fix behavior (may fail before T2 lands).
// ---------------------------------------------------------------------------

console.log('\n── Advisor Disagreement Checks ──\n');

var eventsPath = path.join(__dirname, '..', 'events.js');
var eventsAPI  = null;

if (fs.existsSync(eventsPath)) {
  var eventsCode    = fs.readFileSync(eventsPath, 'utf8');
  var eventsSandbox = { Math: Math, console: console, module: { exports: {} }, exports: {} };
  eventsSandbox.module.exports = eventsSandbox.exports;
  vm.createContext(eventsSandbox);

  // events.js uses `const` — wrap in IIFE so top-level consts are accessible on sandbox
  var eventsExportNames = ['SHOCK_EVENTS', 'selectEvent', 'ROUTINE_NEWS', 'getAdvisorRecs'];
  var exposeLines = eventsExportNames.map(function(n) {
    return "try { if (typeof " + n + " !== 'undefined') this['" + n + "'] = " + n + "; } catch (_) {}";
  }).join('\n');
  vm.runInContext('(function () {\n' + eventsCode + '\n' + exposeLines + '\n}).call(this)', eventsSandbox);

  eventsAPI = eventsSandbox;
} else {
  console.log('  SKIP: events.js not found — advisor tests skipped');
}

if (eventsAPI && typeof eventsAPI.getAdvisorRecs === 'function') {
  var getAdvisorRecs   = eventsAPI.getAdvisorRecs;
  var diffPreset       = DIFFICULTY_PRESETS.realworld;

  // ── 2a. Mixed conflicting signals → at least 2 different advisor directions ─
  // Inflation below target + unemployment above target: both mandate signals point
  // toward easing, but a hawkish advisor should resist — expect ≥ 2 distinct recs.
  // NOTE: may fail until Builder 3 (T2) adds per-personality divergence for net=-2.
  var recsA = getAdvisorRecs(1.7, 5.5, 1.0, diffPreset);
  assert(Array.isArray(recsA) && recsA.length === 3,
    'Mixed signals (infl=1.7%, unemp=5.5%): getAdvisorRecs returns 3 advisors',
    Array.isArray(recsA) ? recsA.length : typeof recsA);
  if (Array.isArray(recsA) && recsA.length === 3) {
    var uniqueDirectionsA = recsA.reduce(function(s, r) { return s.add(r.rec); }, new Set());
    assert(uniqueDirectionsA.size >= 2,
      'Mixed signals (infl=1.7%, unemp=5.5%): at least 2 different directions among advisors',
      recsA.map(function(r) { return r.name + ':' + r.rec; }).join(', '));
  }

  // ── 2b. Hawkish Dr. Chen leans Raise when inflation is clearly elevated ───────
  // Elevated inflation (3.0%) despite moderate labor slack (5.5%) — Chen should
  // favor tightening even when unemployment is above target.
  // NOTE: may fail until Builder 3 (T2) extends Chen's hawkish threshold.
  var recsB = getAdvisorRecs(3.0, 5.5, 1.0, diffPreset);
  if (Array.isArray(recsB) && recsB.length === 3) {
    var chenB = recsB.find(function(r) { return r.name === 'Dr. Chen'; }) || recsB[0];
    assert(chenB.rec === 'Raise',
      'Hawkish Dr. Chen recommends Raise when infl=3.0% (elevated) despite unemp=5.5%',
      chenB.rec);
  }

  // ── 2c. Dovish Sec. Park leans Lower when unemployment is high ────────────────
  // High unemployment (6.5%) despite slightly above-target inflation (2.5%) — Park
  // should prioritize labor market over minor inflation overshoot.
  // NOTE: may fail until Builder 3 (T2) extends Park's dovish threshold.
  var recsC = getAdvisorRecs(2.5, 6.5, 1.0, diffPreset);
  if (Array.isArray(recsC) && recsC.length === 3) {
    var parkC = recsC.find(function(r) { return r.name === 'Sec. Park'; }) || recsC[2];
    assert(parkC.rec === 'Lower',
      'Dovish Sec. Park recommends Lower when unemp=6.5% (high) despite infl=2.5% above target',
      parkC.rec);
  }

  // ── 2d. Advisor rationale strings are non-empty and distinct from each other ──
  // Even when advisors agree on direction, their reasoning should sound different.
  var recsD = getAdvisorRecs(3.0, 4.0, 1.0, diffPreset);
  if (Array.isArray(recsD) && recsD.length === 3) {
    var rationalesD = recsD.map(function(r) { return r.rationale; });
    assert(
      rationalesD.every(function(r) { return typeof r === 'string' && r.length > 0; }),
      'All 3 advisor rationale strings are non-empty',
      rationalesD.map(function(r) { return typeof r === 'string' ? r.length + ' chars' : String(r); }));
    assert(
      new Set(rationalesD).size === 3,
      'All 3 advisor rationale strings are distinct from each other',
      rationalesD.map(function(r) { return '"' + (r || '').slice(0, 40) + '..."'; }));
  }
} else if (eventsAPI) {
  console.log('  SKIP: getAdvisorRecs not found in events.js');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');

if (failed > 0) {
  process.exit(1);
}
