/**
 * tests/smoke-test.js
 *
 * Minimal headless smoke test for engine.js and events.js.
 * Runs without a browser by loading each file into a Node.js vm context.
 *
 * engine.js checks:
 *   1. calcFinalScore(history) returns a number in [0, 100]
 *   2. The final quarter tracked is 16 after running 16 steps
 *   3. history array contains exactly 16 entries
 *
 * events.js checks:
 *   4. selectEvent(rng, {eventFreq:1.0}) returns a non-null event
 *   5. selectEvent(rng, {eventFreq:0.0}) returns null
 *   6. Returned event has title (string), inflShock (number),
 *      unempShock (number), severity (string)
 *   7. ROUTINE_NEWS is an array with at least 5 entries
 *   8. getAdvisorRecs(3.0, 4.0, 2.0, DIFFICULTY_PRESETS.realworld)
 *      returns 3 items each with rec === 'Raise' | 'Lower' | 'Hold'
 *
 * Usage:
 *   node tests/smoke-test.js
 *
 * Exit code 0 = all assertions pass (or file absent — soft skip)
 * Exit code 1 = one or more assertions failed
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load a JS file into an isolated vm sandbox.
 *
 * @param {string}   filePath     Absolute path to the file.
 * @param {string[]} [exportNames] When provided, the file is wrapped in an
 *   IIFE so that `const`/`let` top-level declarations (which are block-scoped
 *   in a vm script and would otherwise be invisible) are explicitly copied
 *   onto the sandbox.  Pass the names of every symbol you need to access.
 *
 * @returns {object|null} Resolved exports (CommonJS or sandbox globals),
 *   or null if the file does not exist (caller soft-skips).
 */
function loadModule(filePath, exportNames) {
  if (!fs.existsSync(filePath)) return null;

  const code    = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    Math,
    console,
    module:  { exports: {} },
    exports: {},
  };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);

  if (exportNames && exportNames.length > 0) {
    // Wrap in an IIFE called with the sandbox as `this`.
    // After the file's own code runs, copy named consts/lets onto the sandbox
    // so callers can access them as sandbox.FOO.
    const exposeLines = exportNames
      .map(function (n) {
        return `try { if (typeof ${n} !== 'undefined') this['${n}'] = ${n}; } catch (_) {}`;
      })
      .join('\n');
    const wrapped = `(function () {\n${code}\n${exposeLines}\n}).call(this)`;
    vm.runInContext(wrapped, sandbox);
  } else {
    vm.runInContext(code, sandbox);
  }

  return Object.keys(sandbox.module.exports).length > 0
    ? sandbox.module.exports
    : sandbox;
}

let passed = 0;
let failed = 0;

/** @param {boolean} condition  @param {string} label  @param {*} [actual] */
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

/** Returns true if fn is a function; records a FAIL otherwise. */
function assertFn(fn, name, source) {
  if (typeof fn === 'function') return true;
  console.error(`  FAIL: ${source} must export "${name}" as a function (got: ${typeof fn})`);
  failed++;
  return false;
}

// ---------------------------------------------------------------------------
// ── SECTION 1: engine.js ──────────────────────────────────────────────────
// Public API: mulberry32, getInitialConditions, stepEconomy, calcFinalScore,
//             DIFFICULTY_PRESETS
// ---------------------------------------------------------------------------
console.log('\n=== Chair the Fed — Smoke Test ===');
console.log('\n── Section 1: engine.js ──\n');

const enginePath = path.join(__dirname, '..', 'engine.js');
// engine.js uses `var` and `function` declarations — no exportNames needed
const engineAPI  = loadModule(enginePath);

if (!engineAPI) {
  console.log('SKIP: engine.js not found — T1 not complete yet.\n');
} else {
  const {
    mulberry32,
    getInitialConditions,
    stepEconomy,
    calcFinalScore,
  } = engineAPI;

  const ok1 = assertFn(mulberry32,           'mulberry32',           'engine.js');
  const ok2 = assertFn(getInitialConditions, 'getInitialConditions', 'engine.js');
  const ok3 = assertFn(stepEconomy,          'stepEconomy',          'engine.js');
  const ok4 = assertFn(calcFinalScore,       'calcFinalScore',       'engine.js');

  if (!ok1 || !ok2 || !ok3 || !ok4) {
    console.error('\nCannot run engine simulation — missing required functions.\n');
  } else {
    const diff = engineAPI.DIFFICULTY_PRESETS && engineAPI.DIFFICULTY_PRESETS.realworld;

    assert(diff !== undefined && diff !== null,
      'DIFFICULTY_PRESETS.realworld exists', diff);

    if (diff) {
      const rng  = mulberry32(42);
      const init = getInitialConditions('realworld');

      // Run 16 quarters with Hold (rateChange = 0) and no events
      let infl     = init.inflation;
      let unemp    = init.unemployment;
      let lagInfl  = 0;
      let lagUnemp = 0;
      let inflMom  = 0;
      let unempMom = 0;

      const history = [];
      let finalQuarter = 0;

      for (let q = 1; q <= 16; q++) {
        let result;
        try {
          result = stepEconomy(
            infl, unemp,
            0,            // rateChange = 0 (Hold)
            lagInfl, lagUnemp,
            inflMom, unempMom,
            null,         // no event
            diff, rng
          );
        } catch (e) {
          console.error(`  FAIL: stepEconomy threw on quarter ${q}:`, e.message);
          failed++;
          break;
        }

        infl     = result.newInfl;
        unemp    = result.newUnemp;
        lagInfl  = result.nextLagInfl;
        lagUnemp = result.nextLagUnemp;
        inflMom  = result.newInflMom;
        unempMom = result.newUnempMom;

        history.push({ quarter: q, inflation: infl, unemployment: unemp });
        finalQuarter = q;
      }

      let score;
      try {
        score = calcFinalScore(history);
      } catch (e) {
        console.error('  FAIL: calcFinalScore threw:', e.message);
        failed++;
      }

      assert(typeof score === 'number' && !isNaN(score),
        'calcFinalScore returns a number', score);

      assert(score >= 0 && score <= 100,
        'score is in range [0, 100]', score);

      assert(finalQuarter === 16,
        'final quarter is 16', finalQuarter);

      assert(Array.isArray(history) && history.length === 16,
        'history contains exactly 16 entries',
        Array.isArray(history) ? history.length : typeof history);
    }
  }
}

// ---------------------------------------------------------------------------
// ── SECTION 2: events.js ─────────────────────────────────────────────────
// Public API: selectEvent, ROUTINE_NEWS, getAdvisorRecs
// events.js uses `const` declarations — supply exportNames so they are
// accessible from the sandbox after the IIFE wrapper copies them over.
// ---------------------------------------------------------------------------
console.log('\n── Section 2: events.js ──\n');

const eventsPath    = path.join(__dirname, '..', 'events.js');
const eventsExports = ['SHOCK_EVENTS', 'selectEvent', 'ROUTINE_NEWS', 'getAdvisorRecs'];
const eventsAPI     = loadModule(eventsPath, eventsExports);

if (!eventsAPI) {
  console.log('SKIP: events.js not found — not yet committed.\n');
} else {
  // DIFFICULTY_PRESETS lives in engine.js; reuse already-loaded engineAPI if
  // available, otherwise try events.js itself.
  const DIFFICULTY_PRESETS =
    (engineAPI  && engineAPI.DIFFICULTY_PRESETS)  ||
    (eventsAPI  && eventsAPI.DIFFICULTY_PRESETS);

  const { selectEvent, ROUTINE_NEWS, getAdvisorRecs } = eventsAPI;

  // ── 2a. selectEvent — always fires (freq = 1.0) ──────────────────────────
  if (assertFn(selectEvent, 'selectEvent', 'events.js')) {
    // Deterministic rng returning 0.5 — safely below any threshold < 1.0
    const rngMid = () => 0.5;

    let eventResult;
    try {
      eventResult = selectEvent(rngMid, { eventFreq: 1.0 });
    } catch (e) {
      console.error('  FAIL: selectEvent(rng, {eventFreq:1.0}) threw:', e.message);
      failed++;
      eventResult = undefined;
    }

    if (eventResult !== undefined) {
      assert(eventResult !== null,
        'selectEvent(rng, {eventFreq:1.0}) returns a non-null event', eventResult);

      if (eventResult !== null) {
        assert(typeof eventResult.title === 'string',
          'event.title is a string', eventResult.title);

        assert(typeof eventResult.inflShock === 'number',
          'event.inflShock is a number', eventResult.inflShock);

        assert(typeof eventResult.unempShock === 'number',
          'event.unempShock is a number', eventResult.unempShock);

        assert(typeof eventResult.severity === 'string',
          'event.severity is a string', eventResult.severity);
      }
    }

    // ── 2b. selectEvent — never fires (freq = 0.0) ────────────────────────
    let nullResult;
    try {
      nullResult = selectEvent(rngMid, { eventFreq: 0.0 });
    } catch (e) {
      console.error('  FAIL: selectEvent(rng, {eventFreq:0.0}) threw:', e.message);
      failed++;
      nullResult = undefined;
    }

    if (nullResult !== undefined) {
      assert(nullResult === null,
        'selectEvent(rng, {eventFreq:0.0}) returns null', nullResult);
    }
  }

  // ── 2c. ROUTINE_NEWS ─────────────────────────────────────────────────────
  assert(Array.isArray(ROUTINE_NEWS) && ROUTINE_NEWS.length >= 5,
    'ROUTINE_NEWS is an array with at least 5 entries',
    Array.isArray(ROUTINE_NEWS) ? ROUTINE_NEWS.length : typeof ROUTINE_NEWS);

  // ── 2d. getAdvisorRecs ───────────────────────────────────────────────────
  if (assertFn(getAdvisorRecs, 'getAdvisorRecs', 'events.js')) {
    const preset = DIFFICULTY_PRESETS && DIFFICULTY_PRESETS.realworld;

    assert(preset !== undefined && preset !== null,
      'DIFFICULTY_PRESETS.realworld is available for getAdvisorRecs', preset);

    if (preset) {
      let recs;
      try {
        recs = getAdvisorRecs(3.0, 4.0, 2.0, preset);
      } catch (e) {
        console.error(
          '  FAIL: getAdvisorRecs(3.0, 4.0, 2.0, DIFFICULTY_PRESETS.realworld) threw:',
          e.message
        );
        failed++;
        recs = undefined;
      }

      if (recs !== undefined) {
        assert(Array.isArray(recs) && recs.length === 3,
          'getAdvisorRecs returns array of 3 items',
          Array.isArray(recs) ? recs.length : typeof recs);

        if (Array.isArray(recs)) {
          const validRecs = new Set(['Raise', 'Lower', 'Hold']);
          recs.forEach(function (item, i) {
            assert(
              item !== null &&
              typeof item === 'object' &&
              typeof item.rec === 'string' &&
              validRecs.has(item.rec),
              `recs[${i}].rec is 'Raise', 'Lower', or 'Hold'`,
              item && item.rec
            );
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
