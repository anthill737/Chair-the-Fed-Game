/**
 * tests/smoke-test.js
 *
 * Minimal headless smoke test for engine.js.
 * Runs without a browser by loading engine.js into a Node.js vm context.
 *
 * Verifies:
 *   1. Score returned by calculateFinalScore() is a number in [0, 100]
 *   2. state.quarter equals 16 after 16 turns
 *   3. state.history contains exactly 16 entries
 *
 * Usage:
 *   node tests/smoke-test.js
 *
 * Exit code 0 = all assertions pass
 * Exit code 1 = one or more assertions failed
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ---------------------------------------------------------------------------
// Load engine.js into an isolated vm sandbox so we can call its globals
// without a browser. The sandbox exposes the same global shape the browser
// would provide (Math, console, etc.) plus a minimal module shim.
// ---------------------------------------------------------------------------
const enginePath = path.join(__dirname, '..', 'engine.js');

if (!fs.existsSync(enginePath)) {
  console.error('SKIP: engine.js not found — T1 not complete yet.');
  process.exit(0); // soft-skip rather than hard fail while T1 is in progress
}

const engineCode = fs.readFileSync(enginePath, 'utf8');

const sandbox = {
  Math,
  console,
  // CommonJS shim in case engine.js uses module.exports
  module:  { exports: {} },
  exports: {},
};
sandbox.module.exports = sandbox.exports;
vm.createContext(sandbox);
vm.runInContext(engineCode, sandbox);

// Resolve public API — prefer CommonJS exports, then fall back to sandbox globals
const engineExports =
  Object.keys(sandbox.module.exports).length > 0
    ? sandbox.module.exports
    : sandbox;

// Pull out required functions
const {
  createInitialState,
  makeDecision,
  calculateFinalScore,
} = engineExports;

// ---------------------------------------------------------------------------
// Minimal assertion helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

/**
 * @param {boolean} condition
 * @param {string}  label
 * @param {*}       [actual]   optional value to print on failure
 */
function assert(condition, label, actual) {
  if (condition) {
    console.log('  PASS:', label);
    passed++;
  } else {
    const suffix = actual !== undefined ? ` (got: ${JSON.stringify(actual)})` : '';
    console.error('  FAIL:', label + suffix);
    failed++;
  }
}

function assertDefined(fn, name) {
  if (typeof fn !== 'function') {
    console.error(`  FAIL: engine.js must export a function named "${name}" (got: ${typeof fn})`);
    failed++;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Verify required exports exist before running the simulation
// ---------------------------------------------------------------------------
console.log('\n=== Chair the Fed — Smoke Test ===\n');
console.log('Checking engine.js exports...');

const hasCreate  = assertDefined(createInitialState,  'createInitialState');
const hasDecide  = assertDefined(makeDecision,        'makeDecision');
const hasScore   = assertDefined(calculateFinalScore, 'calculateFinalScore');

if (!hasCreate || !hasDecide || !hasScore) {
  console.error('\nCannot run simulation — missing required functions.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Run a full 16-quarter game using Hold on every turn
//
// Seed = 42, difficulty = 'normal' (adjust if engine uses different signatures)
// ---------------------------------------------------------------------------
console.log('\nRunning 16-quarter Hold simulation...\n');

let state;
try {
  state = createInitialState(42, 'normal');
} catch (e) {
  console.error('  FAIL: createInitialState(42, "normal") threw:', e.message);
  process.exit(1);
}

const HOLD = 'hold';

for (let q = 0; q < 16; q++) {
  try {
    state = makeDecision(state, HOLD);
  } catch (e) {
    console.error(`  FAIL: makeDecision threw on quarter ${q + 1}:`, e.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Calculate final score
// ---------------------------------------------------------------------------
let score;
try {
  score = calculateFinalScore(state);
} catch (e) {
  console.error('  FAIL: calculateFinalScore threw:', e.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
console.log('Assertions:\n');

assert(typeof score === 'number' && !isNaN(score),
  'score is a number', score);

assert(score >= 0 && score <= 100,
  'score is in range [0, 100]', score);

// quarter tracking: state.quarter should be 16 after 16 processed turns
// (some implementations may store the last completed quarter rather than
//  the next upcoming one — accept both 16 and 17 only if history length is 16)
const quarterOk = state.quarter === 16;
assert(quarterOk, 'state.quarter is 16 after 16 turns', state.quarter);

const historyOk =
  Array.isArray(state.history) && state.history.length === 16;
assert(historyOk,
  'state.history contains exactly 16 entries',
  Array.isArray(state.history) ? state.history.length : typeof state.history);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
