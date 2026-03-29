/* ==========================================================================
   CHAIR THE FED — app.js
   Live simulation wired to engine.js and events.js (both loaded before this).

   Architecture:
     1. CONSTANTS              — display targets, rate bounds
     2. GAME STATE             — createInitialState with full sim fields
     3. RENDERING / UI         — DOM updates, news, advisors, rate selector
     4. CHART                  — main chart, end-screen sparklines
     5. GAME FLOW              — init, makeDecision, nextQuarter, reset
     6. MISC                   — menu, keyboard, resize, DOMContentLoaded
   ========================================================================== */


/* ==========================================================================
   1. CONSTANTS
   ========================================================================== */

// Fed mandate targets — used for display and scoring
var TARGET_INFLATION    = 2.0;
var TARGET_UNEMPLOYMENT = 5.0;

// Rate selector bounds — NOTE: use var to avoid conflict with engine.js globals
var RATE_MIN  = 0.00;
var RATE_MAX  = 10.0;
var RATE_STEP = 0.25;

var TOTAL_QUARTERS   = 16;
var START_YEAR       = 2014;
var GRAPH_ANIMATION_MS = 1100;

// Difficulty selector descriptions
var DIFFICULTY_DESCRIPTIONS = {
  textbook:  'Forgiving economy with smaller shocks. Good for learning the basics.',
  realworld: 'Calibrated to historical Fed data. The intended experience.',
  crisis:    'Volatile economy. Policy lags hurt more. Not for the faint of heart.'
};

// Tracks difficulty across startGame calls (set by selectDifficulty)
var selectedDifficulty = 'realworld';

// No-op stubs for HTML onclick attrs that reference these before game starts
function getDailySeed() {
  var d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function selectDifficulty(key) {
  selectedDifficulty = key;
  document.querySelectorAll('.btn-difficulty').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.diff === key);
  });
  var descEl = document.getElementById('difficulty-description');
  if (descEl) descEl.textContent = DIFFICULTY_DESCRIPTIONS[key] || '';
  if (typeof state !== 'undefined' && state && state.difficulty !== undefined) {
    state.difficulty = key;
    if (state.diff !== undefined) state.diff = DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS.realworld;
  }
}


// Global game state — initialized by startGame(), referenced by all rendering functions
var state = {};


/* ==========================================================================
   2. GAME STATE
   ========================================================================== */

/**
 * Create the initial game state for a new run.
 * @param {string}      difficulty — 'textbook' | 'realworld' | 'crisis'
 * @param {number|null} seed       — integer seed (null = random)
 */
function createInitialState(difficulty, seed) {
  var diff   = difficulty || 'realworld';
  var s      = (seed != null) ? (seed >>> 0) : (Math.floor(Math.random() * 0x100000000) >>> 0);
  var rng    = mulberry32(s);
  var preset = DIFFICULTY_PRESETS[diff] || DIFFICULTY_PRESETS.realworld;

  // Randomized near-target starting conditions — close to mandate but not perfect.
  // Inflation [1.8, 2.4], unemployment [4.8, 5.6], fed rate [3.0, 5.0] (rounded to 0.25).
  var initInflation    = Math.round((1.8 + rng() * 0.6) * 100) / 100;
  var initUnemployment = Math.round((4.8 + rng() * 0.8) * 100) / 100;
  var initFedRate      = Math.round((3.0 + rng() * 2.0) * 4)   / 4;

  return {
    quarter:      1,
    inflation:    initInflation,
    unemployment: initUnemployment,
    fedRate:      initFedRate,
    pendingRate:  initFedRate,

    // Simulation fields
    difficulty:      diff,
    diff:            preset,        // resolved preset object — passed to stepEconomy
    seed:            s,
    rng:             rng,
    lagInflEffect:   0,             // deferred inflation effect carried from last quarter
    lagUnempEffect:  0,             // deferred unemployment effect carried from last quarter
    inflMom:         0,             // momentum: last quarter's inflation delta
    unempMom:        0,             // momentum: last quarter's unemployment delta
    nextLagInfl:     0,             // lag to apply after this quarter's animation finishes
    nextLagUnemp:    0,
    nextInflMom:     0,
    nextUnempMom:    0,
    initialFedRate:  initFedRate,   // starting rate — used by end-screen "Started: X%" display
    totalPenalty:    0,             // cumulative quarter penalties
    currentEvent:    null,          // event that fired this quarter (set in makeDecision)

    // UI state
    phase:            'decision',   // 'decision' | 'animating' | 'result'
    history:          [],
    chartPoints:      [buildChartPoint(0, initInflation, initUnemployment, initFedRate)],
    chartAnimation:   null,
    animationFrameId: 0,
    totalQuarters:    TOTAL_QUARTERS
  };
}


/* ==========================================================================
   3. RENDERING / UI
   ========================================================================== */

/** Toggle between named screens */
function showScreen(id, scrollTarget) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  var target = document.getElementById(id);
  target.classList.add('active');
  target.scrollTop = 0;
  document.documentElement.classList.toggle('game-screen-active', id === 'screen-game');
  requestAnimationFrame(function() {
    if (scrollTarget) {
      var el = document.getElementById(scrollTarget);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    }
    window.scrollTo(0, 0);
  });
}

/** Format a number to fixed decimal places, with optional sign */
function fmt(val, dec, sign) {
  if (dec == null) dec = 2;
  var s = Math.abs(val).toFixed(dec);
  if (sign) return (val >= 0 ? '+' : '\u2212') + s;
  return s;
}

/** Return quarter number and year for a 1-based quarter index */
function getQuarterInfo(quarterNumber) {
  var quarterIndex = quarterNumber - 1;
  var qNum = (quarterIndex % 4) + 1;
  var year = START_YEAR + Math.floor(quarterIndex / 4);
  return { qNum: qNum, year: year, label: 'Q' + qNum + ' ' + year };
}

/** Update the timeline progress bar */
function renderQuarterProgress() {
  var totalQ    = state.totalQuarters || TOTAL_QUARTERS;
  var current   = getQuarterInfo(state.quarter || 1);
  var start     = getQuarterInfo(1);
  var end       = getQuarterInfo(totalQ);
  var progress  = totalQ === 1
    ? 100
    : ((state.quarter || 1) - 1) / (totalQ - 1) * 100;

  var currentLabel   = document.getElementById('timeline-current-label');
  var startLabel     = document.getElementById('timeline-start-label');
  var endLabel       = document.getElementById('timeline-end-label');
  var progressLine   = document.getElementById('timeline-progress-line');
  var progressMarker = document.getElementById('timeline-progress-marker');

  if (currentLabel)   currentLabel.textContent   = current.label;
  if (startLabel)     startLabel.textContent      = start.label;
  if (endLabel)       endLabel.textContent        = end.label;
  if (progressLine)   progressLine.style.width    = progress + '%';
  if (progressMarker) progressMarker.style.left   = progress + '%';
}

/** Update the game header: quarter counter and running score */
function renderHeader() {
  var totalQ  = state.totalQuarters || TOTAL_QUARTERS;
  document.getElementById('hdr-quarter').textContent =
    (state.quarter || 1) + ' / ' + totalQ;

  var scoreEl = document.getElementById('hdr-score');
  if (scoreEl) {
    if (state.history && state.history.length > 0) {
      var currentScore = calcFinalScore(state.history);
      scoreEl.textContent = currentScore;
      scoreEl.classList.remove('hdr-score--good', 'hdr-score--ok', 'hdr-score--poor');
      if (currentScore >= 75)       scoreEl.classList.add('hdr-score--good');
      else if (currentScore >= 50)  scoreEl.classList.add('hdr-score--ok');
      else                          scoreEl.classList.add('hdr-score--poor');
    } else {
      scoreEl.textContent = '\u2014';
      scoreEl.classList.remove('hdr-score--good', 'hdr-score--ok', 'hdr-score--poor');
    }
  }

  renderQuarterProgress();
}

/** Update the three economic indicator values and their status tags */
function renderIndicators() {
  var inflEl  = document.getElementById('val-inflation');
  var unempEl = document.getElementById('val-unemployment');
  var rateEl  = document.getElementById('val-rate');

  if (inflEl)  inflEl.textContent  = fmt(state.inflation)    + '%';
  if (unempEl) unempEl.textContent = fmt(state.unemployment) + '%';
  if (rateEl)  rateEl.textContent  = fmt(state.fedRate)      + '%';

  if (inflEl)  inflEl.classList.remove('near-target', 'over-target', 'under-target');
  if (unempEl) unempEl.classList.remove('near-target', 'over-target', 'under-target');

  setIndicatorStatus('ind-inflation',    state.inflation,    TARGET_INFLATION,    0.5);
  setIndicatorStatus('ind-unemployment', state.unemployment, TARGET_UNEMPLOYMENT, 0.5);

  var setStateBorder = function(el, val, target) {
    var parent = el && el.closest ? el.closest('.indicator') : null;
    if (!parent) return;
    parent.classList.remove('state-over', 'state-under', 'state-near');
    var diff = val - target;
    if (Math.abs(diff) <= 0.5) parent.classList.add('state-near');
    else if (diff > 0)         parent.classList.add('state-over');
    else                       parent.classList.add('state-under');
  };
  if (inflEl)  setStateBorder(inflEl,  state.inflation,    TARGET_INFLATION);
  if (unempEl) setStateBorder(unempEl, state.unemployment, TARGET_UNEMPLOYMENT);
}

/** Show a small status pill inside an indicator container */
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
    statusEl.textContent = '\u25cf On target';
    statusEl.classList.add('ind-status--on');
  } else if (diff > 0) {
    statusEl.textContent = '\u25b2 Above target';
    statusEl.classList.add('ind-status--over');
  } else {
    statusEl.textContent = '\u25bc Below target';
    statusEl.classList.add('ind-status--under');
  }
}

function setIndicatorClass(el, val, target, nearThresh, warnThresh) {
  el.classList.remove('near-target', 'over-target', 'under-target');
  var diff = val - target;
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
 * Build a dynamic quarterly briefing from real state values.
 * Generates payroll, CPI, unemployment, and financial conditions sentences
 * so each quarter's briefing references actual numbers rather than static text.
 *
 * @param {number}      infl      — current inflation (%)
 * @param {number}      unemp     — current unemployment (%)
 * @param {number|null} prevInfl  — inflation last quarter (null = no history yet)
 * @param {number|null} prevUnemp — unemployment last quarter (null = no history yet)
 * @param {number}      fedRate   — current fed funds rate (%)
 * @returns {string} HTML string for the news-body element
 */
function buildDynamicBriefing(infl, unemp, prevInfl, prevUnemp, fedRate) {
  var f1 = function(n) { return n.toFixed(1); };

  var unempDelta = prevUnemp != null ? Math.round((unemp - prevUnemp) * 10) / 10 : null;

  // Implied monthly payrolls (thousands): baseline ~175K + labor market signal
  var payrollBase = 175;
  var payrollAdj  = unempDelta != null ? Math.round(-unempDelta * 1500) : 0;
  var payrolls    = Math.max(-200, Math.min(390, payrollBase + payrollAdj));

  // Sentence 1: payrolls + unemployment movement
  var payrollStr;
  if (payrolls >= 200)      payrollStr = 'Payrolls added ' + payrolls + ',000 jobs';
  else if (payrolls >= 50)  payrollStr = 'Payrolls added a modest ' + payrolls + ',000 jobs';
  else if (payrolls >= 0)   payrollStr = 'Payrolls came in flat, adding just ' + payrolls + ',000 jobs';
  else                      payrollStr = 'Payrolls shed ' + Math.abs(payrolls) + ',000 jobs';

  var unempStr;
  if (unempDelta !== null && unempDelta < -0.09)      unempStr = 'unemployment fell to ' + f1(unemp) + '%';
  else if (unempDelta !== null && unempDelta > 0.09)  unempStr = 'unemployment ticked up to ' + f1(unemp) + '%';
  else                                                 unempStr = 'unemployment held at ' + f1(unemp) + '%';

  var s1 = payrollStr + '; ' + unempStr + '.';

  // Sentence 2: CPI reading
  var s2;
  if (infl > 2.5) {
    s2 = 'CPI ran at ' + f1(infl) + '%, above the 2% target — price pressures are building in services and shelter.';
  } else if (infl >= 1.8) {
    s2 = 'Inflation held near target at ' + f1(infl) + '%. Core goods were flat; services costs edged slightly higher.';
  } else {
    s2 = 'CPI came in at ' + f1(infl) + '%, below the 2% target — soft commodity prices are keeping headline readings subdued.';
  }

  // Implied annual wage growth from labor tightness
  var wageRate = unemp < 4.5 ? 4.2 : unemp < 5.0 ? 3.5 : unemp < 5.5 ? 2.8 : unemp < 6.0 ? 2.3 : 1.9;

  // Context sentence
  var ctx;
  if (infl > 2.4 && unemp < 5.0) {
    ctx = 'Wage growth near ' + f1(wageRate) + '% annually is adding to services costs. A tight labor market leaves little room for accommodation.';
  } else if (infl < 1.7 && unemp > 5.5) {
    ctx = 'Consumer spending growth has softened. Subdued prices and a slack labor market suggest the economy could use more support.';
  } else if (infl > 2.3) {
    ctx = 'Wage growth near ' + f1(wageRate) + '% annually is keeping services inflation elevated. Watch core CPI in coming quarters.';
  } else if (unemp > 5.5) {
    ctx = 'Hiring is running below trend and consumer confidence has dipped. Financial conditions remain ' + (fedRate >= 4.0 ? 'tight' : 'stable') + '.';
  } else if (unemp < 4.5) {
    ctx = 'Strong labor demand has pushed wages to ~' + f1(wageRate) + '% growth annually. Consumer spending is healthy.';
  } else {
    ctx = 'Financial conditions remain ' + (fedRate >= 5.0 ? 'tight' : fedRate >= 3.5 ? 'moderate' : 'accommodative') + '. No major credit or market disruptions this quarter.';
  }

  return '<p>' + s1 + ' ' + s2 + '</p><p class="news-context">' + ctx + '</p>';
}

/**
 * Render the news panel.
 * If state.currentEvent is set (fires after GO), show event details with alert.
 * Otherwise build a dynamic briefing from current state values.
 */
function renderNews() {
  var quarterInfo = getQuarterInfo(state.quarter || 1);
  var label = document.getElementById('news-quarter-label');
  var badge = document.getElementById('news-badge');
  var body  = document.getElementById('news-body');
  var alert = document.getElementById('news-alert');

  var evt = state.currentEvent;

  if (evt) {
    // Map severity to badge CSS class
    var badgeClass = evt.severity === 'major'    ? 'critical' :
                     evt.severity === 'moderate' ? 'warning'  : 'routine';

    if (label) label.textContent = quarterInfo.label + ' \u2014 ' + evt.headline;
    if (badge) {
      badge.textContent = evt.severity ? evt.severity.toUpperCase() : 'EVENT';
      badge.className   = 'news-badge ' + badgeClass;
    }
    if (body) body.innerHTML = evt.body;
    if (alert) {
      alert.classList.remove('hidden', 'news-alert--flash', 'news-alert--panic');
      var alertHeadline = document.getElementById('news-alert-headline');
      var alertText     = document.getElementById('news-alert-text');
      if (alertHeadline) alertHeadline.textContent = evt.headline;
      if (alertText)     alertText.textContent     = evt.title || '';
      // Trigger flash animation
      setTimeout(function() {
        if (alert) alert.classList.add('news-alert--flash');
      }, 0);
    }
  } else {
    // Dynamic briefing from current economic state
    var prevRecord = state.history && state.history.length > 0 ? state.history[state.history.length - 1] : null;
    if (label) label.textContent = quarterInfo.label + ' \u2014 Economic Briefing';
    if (badge) {
      badge.textContent = 'MARKET UPDATE';
      badge.className   = 'news-badge routine';
    }
    if (body) body.innerHTML = buildDynamicBriefing(
      state.inflation    || TARGET_INFLATION,
      state.unemployment || TARGET_UNEMPLOYMENT,
      prevRecord ? prevRecord.inflation    : null,
      prevRecord ? prevRecord.unemployment : null,
      state.fedRate || 0
    );
    if (alert) {
      alert.classList.add('hidden');
      alert.classList.remove('news-alert--flash', 'news-alert--panic');
      var ah = document.getElementById('news-alert-headline');
      var at = document.getElementById('news-alert-text');
      if (ah) ah.textContent = '';
      if (at) at.textContent = '';
    }
  }

  var shockBannerEl = document.getElementById('shock-status-banner');
  if (shockBannerEl) shockBannerEl.style.display = 'none';
}

/**
 * Render advisor panel with signal-combining logic derived from current state.
 * All three advisors agree on direction (no conflicts); rationales reflect persona.
 *
 *   inflSig  +1 = inflation above 2% → raise bias   -1 = below 2% → lower bias
 *   unempSig +1 = unemployment below 5% (tight) → raise   -1 = above 5% (slack) → lower
 *   combined: +2/-2 = strong signal; +1/-1 = mild; 0 = mixed/near-target → Hold
 */
function renderAdvisors() {
  var container = document.getElementById('advisors-list');
  if (!container) return;

  var infl  = state.inflation    != null ? state.inflation    : TARGET_INFLATION;
  var unemp = state.unemployment != null ? state.unemployment : TARGET_UNEMPLOYMENT;

  var inflSig  = infl  > TARGET_INFLATION    ? 1 : infl  < TARGET_INFLATION    ? -1 : 0;
  var unempSig = unemp < TARGET_UNEMPLOYMENT ? 1 : unemp > TARGET_UNEMPLOYMENT ? -1 : 0;

  var combined = inflSig + unempSig;
  var bothNear = Math.abs(infl  - TARGET_INFLATION)    <= 0.15
              && Math.abs(unemp - TARGET_UNEMPLOYMENT) <= 0.15;

  // All advisors share the same direction — no conflicts possible
  var direction = (bothNear || combined === 0) ? 'Hold'
                : combined > 0 ? 'Raise' : 'Lower';

  var strong = Math.abs(combined) === 2; // both signals point same way

  function f1(n) { return (n || 0).toFixed(1); }
  function inflWord()  { var d = Math.abs(infl  - TARGET_INFLATION);    return d < 0.2 ? 'slightly' : d < 0.6 ? 'moderately' : 'significantly'; }
  function unempWord() { var d = Math.abs(unemp - TARGET_UNEMPLOYMENT); return d < 0.2 ? 'slightly' : d < 0.6 ? 'moderately' : 'significantly'; }

  function chenRationale() { // hawkish — leads with inflation signal
    if (direction === 'Raise') {
      if (infl > TARGET_INFLATION && unemp < TARGET_UNEMPLOYMENT)
        return 'Inflation\u2019s at ' + f1(infl) + '% and the job market is running hot. We\u2019re behind the curve \u2014 I\u2019d raise now.';
      if (infl > TARGET_INFLATION)
        return 'Inflation\u2019s at ' + f1(infl) + '%, ' + inflWord() + ' above 2%. We can\u2019t afford to wait \u2014 raise rates and get ahead of it.';
      return 'Unemployment at ' + f1(unemp) + '% is overheating. I\u2019d raise before this turns into a wage-price problem.';
    }
    if (direction === 'Lower') {
      if (infl < TARGET_INFLATION && unemp > TARGET_UNEMPLOYMENT)
        return 'Both sides of the mandate are pointing the same way. Inflation at ' + f1(infl) + '%, unemployment at ' + f1(unemp) + '% \u2014 cut rates.';
      if (infl < TARGET_INFLATION)
        return 'Inflation\u2019s slipped to ' + f1(infl) + '%, below our target. Even I\u2019d ease here \u2014 we can\u2019t ignore the mandate.';
      return 'Unemployment at ' + f1(unemp) + '% is ' + unempWord() + ' too high. I\u2019d ease to shore up the labor market.';
    }
    return 'Inflation at ' + f1(infl) + '%, unemployment at ' + f1(unemp) + '% \u2014 we\u2019re close to mandate. I\u2019d hold for now.';
  }

  function riveraRationale() { // balanced — weighs both mandates equally
    if (direction === 'Raise') {
      if (strong)
        return 'Inflation at ' + f1(infl) + '% and tight labor at ' + f1(unemp) + '% \u2014 both sides are pointing up. A raise makes sense to me.';
      if (infl > TARGET_INFLATION)
        return 'Inflation\u2019s a bit above target at ' + f1(infl) + '%. Nothing alarming, but I\u2019d nudge rates up to keep expectations anchored.';
      return 'The labor market\u2019s tighter than normal at ' + f1(unemp) + '%. I\u2019d raise gently \u2014 no need to rush, but a small move is sensible.';
    }
    if (direction === 'Lower') {
      if (strong)
        return 'Inflation at ' + f1(infl) + '%, unemployment at ' + f1(unemp) + '% \u2014 both say ease. I\u2019d cut rates.';
      if (unemp > TARGET_UNEMPLOYMENT)
        return 'Unemployment\u2019s at ' + f1(unemp) + '%, a bit elevated. I\u2019d lean toward cutting to support the labor market.';
      return 'Inflation\u2019s at ' + f1(infl) + '%, below our 2% target. A small cut would help close the gap.';
    }
    return 'Inflation at ' + f1(infl) + '%, unemployment at ' + f1(unemp) + '% \u2014 things look pretty balanced. I\u2019d hold and watch how it develops.';
  }

  function parkRationale() { // dovish — leads with unemployment signal
    if (direction === 'Raise') {
      if (strong)
        return 'Even with my focus on jobs, inflation at ' + f1(infl) + '% and unemployment at ' + f1(unemp) + '% make a careful raise hard to argue against.';
      if (unemp < TARGET_UNEMPLOYMENT)
        return 'Unemployment\u2019s at ' + f1(unemp) + '%, below the natural rate. I can see the argument for a small nudge up.';
      return 'Inflation\u2019s at ' + f1(infl) + '%, above target. A small raise now is better than a harder correction later.';
    }
    if (direction === 'Lower') {
      if (unemp > TARGET_UNEMPLOYMENT)
        return 'Unemployment\u2019s at ' + f1(unemp) + '% \u2014 too many people out of work. Cut rates and get more people hired.';
      return 'Inflation\u2019s at ' + f1(infl) + '%, below target. Lower rates would nudge prices and growth in the right direction.';
    }
    return 'Inflation at ' + f1(infl) + '% and unemployment at ' + f1(unemp) + '% are both close to where we want them. I\u2019d hold and watch for now.';
  }

  var advisors = [
    { name: 'Dr. Chen',    title: 'Chief Economist',  avatar: 'C', rec: direction, rationale: chenRationale()   },
    { name: 'Gov. Rivera', title: 'Fed Governor',     avatar: 'R', rec: direction, rationale: riveraRationale() },
    { name: 'Sec. Park',   title: 'Treasury Advisor', avatar: 'P', rec: direction, rationale: parkRationale()   }
  ];

  container.innerHTML = advisors.map(function(advisor) {
    var recLower  = advisor.rec.toLowerCase();
    var recClass  = 'advisor-rec--' + recLower;
    var cardClass = recLower === 'hold' ? 'advisor-card--calm' : 'advisor-card--concerned';
    return '<div class="advisor-card ' + cardClass + '">'
      + '<div class="advisor-content">'
      + '<div class="advisor-header-row">'
      + '<div class="advisor-avatar">' + advisor.avatar + '</div>'
      + '<div class="advisor-name-block">'
      + '<span class="advisor-name">' + advisor.name + '</span>'
      + '<span class="advisor-title-text">' + advisor.title + '</span>'
      + '</div>'
      + '<span class="advisor-rec ' + recClass + '">' + advisor.rec + '</span>'
      + '</div>'
      + '<div class="advisor-rationale">' + advisor.rationale + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

/** Build and render the rate selector panel */
function renderRateSelector(preserveScroll) {
  var container = document.getElementById('rate-selector-list');
  if (!container) return;

  var savedScrollTop = container.scrollTop;

  var html = '';
  for (var r = RATE_MAX; r >= RATE_MIN - 0.001; r -= RATE_STEP) {
    var rv     = Math.round(r * 100) / 100;
    var sel    = Math.abs(rv - state.pendingRate) < 0.001;
    var isCurr = Math.abs(rv - state.fedRate)     < 0.001;
    var cls    = sel ? 'rate-option selected' : isCurr ? 'rate-option current' : 'rate-option';
    html += '<div class="' + cls + '" data-rate="' + rv + '" onclick="selectRate(' + rv + ')">'
          + '<span class="rate-val">' + fmt(rv) + '%</span>'
          + (isCurr ? '<span class="rate-tag current-tag">CURRENT</span>' : '')
          + (sel && !isCurr ? '<span class="rate-tag select-tag">SELECTED</span>' : '')
          + '</div>';
  }
  container.innerHTML = html;

  if (preserveScroll) {
    container.scrollTop = savedScrollTop;
  } else {
    requestAnimationFrame(function() {
      var selEl = container.querySelector('.selected');
      if (!selEl || container.clientHeight === 0) return;
      var cr = container.getBoundingClientRect();
      var sr = selEl.getBoundingClientRect();
      container.scrollTop = Math.max(0,
        sr.top - cr.top + container.scrollTop - (container.clientHeight - selEl.clientHeight) / 2
      );
    });
  }

  var delta = Math.round((state.pendingRate - state.fedRate) * 100) / 100;
  var sumEl  = document.getElementById('rate-change-summary');
  if (sumEl) {
    if (Math.abs(delta) < 0.001) {
      sumEl.textContent = 'No change \u2014 Hold steady at ' + fmt(state.fedRate) + '%';
      sumEl.className = 'rate-change-summary hold';
    } else if (delta > 0) {
      sumEl.textContent = '\u25b2 Raise ' + fmt(delta) + '% \u2192 New rate: ' + fmt(state.pendingRate) + '%';
      sumEl.className = 'rate-change-summary raise';
    } else {
      sumEl.textContent = '\u25bc Lower ' + fmt(Math.abs(delta)) + '% \u2192 New rate: ' + fmt(state.pendingRate) + '%';
      sumEl.className = 'rate-change-summary lower';
    }
  }

  var goButton = document.querySelector('#panel-decision .btn-go');
  if (goButton) goButton.disabled = state.phase !== 'decision';
}

/** Handle rate option click */
function selectRate(rate) {
  if (state.phase !== 'decision') return;
  state.pendingRate = Math.round(rate * 100) / 100;
  renderRateSelector(true);
}

/** Append one row to the in-game history table */
function appendHistoryRow(record) {
  var tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  var quarterInfo = getQuarterInfo(record.quarter);
  var inflClass   = getDeviationClass(record.inflation,    TARGET_INFLATION,    0.5);
  var unempClass  = getDeviationClass(record.unemployment, TARGET_UNEMPLOYMENT, 0.5);

  var row = document.createElement('tr');
  row.innerHTML =
    '<td>' + quarterInfo.label + '</td>' +
    '<td class="' + inflClass  + '">' + fmt(record.inflation)    + '%</td>' +
    '<td class="' + unempClass + '">' + fmt(record.unemployment) + '%</td>' +
    '<td>' + fmt(record.rate) + '%</td>' +
    '<td>' + record.decision + '</td>' +
    '<td>' + (record.eventTitle || '\u2014') + '</td>';
  tbody.appendChild(row);
}

function getDeviationClass(val, target, thresh) {
  if (val > target + thresh)  return 'cell-high';
  if (val < target - thresh)  return 'cell-low';
  return '';
}

/**
 * Render the result panel after a decision with real economy values.
 * @param {number} rateDelta  — rate change this quarter (signed)
 * @param {object} record     — history record: { inflation, unemployment, rate }
 * @param {number} qPenalty   — quarter penalty
 * @param {number} prevInfl   — inflation before this quarter's update
 * @param {number} prevUnemp  — unemployment before this quarter's update
 */
function renderResult(rateDelta, record, qPenalty, prevInfl, prevUnemp) {
  var body = document.getElementById('result-body');

  var decisionText = Math.abs(rateDelta) < 0.001
    ? 'You held the rate steady at ' + fmt(state.fedRate) + '%.'
    : rateDelta > 0
    ? 'You raised the rate by ' + fmt(rateDelta) + '% to ' + fmt(state.pendingRate) + '%.'
    : 'You lowered the rate by ' + fmt(Math.abs(rateDelta)) + '% to ' + fmt(state.pendingRate) + '%.';

  var newInfl  = record ? record.inflation    : state.inflation;
  var newUnemp = record ? record.unemployment : state.unemployment;
  var inflDelta  = (prevInfl  != null) ? (newInfl  - prevInfl)  : 0;
  var unempDelta = (prevUnemp != null) ? (newUnemp - prevUnemp) : 0;

  var inflArrow  = Math.abs(inflDelta)  < 0.005 ? '' :
    (inflDelta  > 0 ? ' \u25b2 +' + fmt(inflDelta)        : ' \u25bc \u2212' + fmt(Math.abs(inflDelta)));
  var unempArrow = Math.abs(unempDelta) < 0.005 ? '' :
    (unempDelta > 0 ? ' \u25b2 +' + fmt(unempDelta)       : ' \u25bc \u2212' + fmt(Math.abs(unempDelta)));

  if (body) {
    body.innerHTML =
      '<p style="margin-bottom:10px;">' + decisionText + '</p>' +
      '<div class="result-stat">' +
        '<span class="label">Inflation</span>' +
        '<span>' + fmt(newInfl) + '%' + inflArrow +
          ' <span style="color:#888;font-size:0.78rem;">(target 2.0%)</span></span>' +
      '</div>' +
      '<div class="result-stat">' +
        '<span class="label">Unemployment</span>' +
        '<span>' + fmt(newUnemp) + '%' + unempArrow +
          ' <span style="color:#888;font-size:0.78rem;">(target 5.0%)</span></span>' +
      '</div>' +
      '<div class="result-stat">' +
        '<span class="label">Fed Funds Rate</span>' +
        '<span>' + fmt(state.pendingRate) + '%</span>' +
      '</div>';
  }

  var qs = document.getElementById('result-quarter-score');
  if (qs && qPenalty != null) {
    qs.textContent = fmt(qPenalty, 2) + ' pts penalty \u2014 lower is better';
    qs.style.color = qPenalty <= 0.5 ? '#1a6b1a' :
                     qPenalty <= 1.5 ? '#c8a400' : '#b22222';
  }

  var nextBtn = document.getElementById('btn-next');
  if (nextBtn) {
    var limit = state.totalQuarters || TOTAL_QUARTERS;
    nextBtn.textContent = state.quarter >= limit
      ? 'View Final Results \u2192'
      : 'Next Quarter \u2192';
  }
}

/** Populate the end-screen full history table */
function renderEndHistory() {
  var tbody = document.getElementById('end-history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  (state.history || []).forEach(function(record) {
    var quarterInfo = getQuarterInfo(record.quarter);
    var inflClass   = getDeviationClass(record.inflation,    TARGET_INFLATION,    0.5);
    var unempClass  = getDeviationClass(record.unemployment, TARGET_UNEMPLOYMENT, 0.5);
    var row = document.createElement('tr');
    row.innerHTML =
      '<td>' + quarterInfo.label + '</td>' +
      '<td class="' + inflClass  + '">' + fmt(record.inflation)    + '%</td>' +
      '<td class="' + unempClass + '">' + fmt(record.unemployment) + '%</td>' +
      '<td>' + fmt(record.rate) + '%</td>' +
      '<td>' + record.decision + '</td>' +
      '<td>' + (record.eventTitle || '\u2014') + '</td>';
    tbody.appendChild(row);
  });
}

/** Render the end screen with real scoring and verdict from engine.js helpers */
function renderEndScreen() {
  var history    = state.history || [];
  var finalScore = calcFinalScore(history);
  var verdict    = getOutcomeVerdict(finalScore);
  var softLand   = checkSoftLanding(history);
  var bestWorst  = findBestWorstQuarters(history);

  // Verdict card
  var card = document.getElementById('end-verdict-card');
  if (card) {
    card.className = 'end-verdict-card ' + verdict.className;
    card.querySelectorAll('.end-shock-note').forEach(function(el) { el.remove(); });
  }

  var titleEl = document.getElementById('end-verdict-title');
  if (titleEl) titleEl.textContent = verdict.title;

  var scoreEl = document.getElementById('end-score');
  if (scoreEl) scoreEl.textContent = finalScore;

  var textEl = document.getElementById('end-verdict-text');
  if (textEl) textEl.textContent = verdict.text;

  // Summary stats from history
  var avgInfl = 0, avgUnemp = 0;
  if (history.length > 0) {
    for (var i = 0; i < history.length; i++) {
      avgInfl  += history[i].inflation;
      avgUnemp += history[i].unemployment;
    }
    avgInfl  /= history.length;
    avgUnemp /= history.length;
  }
  var finalRate    = history.length > 0 ? history[history.length - 1].rate : state.fedRate;
  var initialPoint = state.chartPoints && state.chartPoints[0] ? state.chartPoints[0] : null;
  var initialFedRate = initialPoint ? initialPoint.rate : state.fedRate;

  var avgInflEl        = document.getElementById('end-avg-infl');
  var avgUnempEl       = document.getElementById('end-avg-unemp');
  var finalRateEl      = document.getElementById('end-final-rate');
  var finalRateStartEl = document.getElementById('end-final-rate-start');

  if (avgInflEl) {
    avgInflEl.textContent = fmt(avgInfl) + '%';
    setIndicatorClass(avgInflEl, avgInfl, TARGET_INFLATION, 0.5, 1.5);
  }
  if (avgUnempEl) {
    avgUnempEl.textContent = fmt(avgUnemp) + '%';
    setIndicatorClass(avgUnempEl, avgUnemp, TARGET_UNEMPLOYMENT, 0.5, 1.5);
  }
  if (finalRateEl)      finalRateEl.textContent      = fmt(finalRate) + '%';
  if (finalRateStartEl) finalRateStartEl.textContent = 'Started: ' + fmt(initialFedRate) + '%';

  // Soft landing badge
  var softEl = document.getElementById('end-soft-landing');
  if (softEl) {
    var valEl = softEl.querySelector('.end-soft-landing-value');
    if (valEl) {
      if (softLand) {
        valEl.textContent  = 'Yes \u2014 Achieved!';
        valEl.style.color  = '#1a6b1a';
        valEl.style.fontWeight = 'bold';
      } else {
        valEl.textContent  = 'No';
        valEl.style.color  = '#b22222';
        valEl.style.fontWeight = 'normal';
      }
    }
  }

  // Best / worst quarters
  var bestWorstEl = document.getElementById('end-best-worst');
  if (bestWorstEl) {
    if (bestWorst.best && bestWorst.worst) {
      var bestInfo  = getQuarterInfo(bestWorst.best.quarter);
      var worstInfo = getQuarterInfo(bestWorst.worst.quarter);
      bestWorstEl.innerHTML =
        '<div class="end-best-worst-item">'
        + '<span class="end-bw-label">Best Quarter</span> '
        + '<span class="end-bw-val cell-low">' + bestInfo.label + '</span>'
        + ' \u2014 ' + fmt(bestWorst.best.penalty, 2) + ' pts penalty'
        + '</div>'
        + '<div class="end-best-worst-item">'
        + '<span class="end-bw-label">Worst Quarter</span> '
        + '<span class="end-bw-val cell-high">' + worstInfo.label + '</span>'
        + ' \u2014 ' + fmt(bestWorst.worst.penalty, 2) + ' pts penalty'
        + '</div>';
    } else {
      bestWorstEl.innerHTML = '';
    }
  }

  // Score breakdown by dimension
  var breakdownEl = document.getElementById('end-score-breakdown');
  if (breakdownEl) {
    var inflTotal = 0, unempTotal = 0;
    for (var j = 0; j < history.length; j++) {
      inflTotal  += Math.abs(history[j].inflation    - TARGET_INFLATION);
      unempTotal += Math.abs(history[j].unemployment - TARGET_UNEMPLOYMENT);
    }
    var n = history.length || 1;
    var inflScore  = Math.max(0, Math.round(100 - (inflTotal  / n / 2.5) * 100));
    var unempScore = Math.max(0, Math.round(100 - (unempTotal / n / 2.5) * 100));
    breakdownEl.innerHTML =
      '<div class="end-breakdown-item">'
      + '<span class="end-bd-label">Inflation Control</span>'
      + '<span class="end-bd-score">' + inflScore + '/100</span>'
      + '</div>'
      + '<div class="end-breakdown-item">'
      + '<span class="end-bd-label">Employment Stability</span>'
      + '<span class="end-bd-score">' + unempScore + '/100</span>'
      + '</div>';
  }

  // Share text
  var shareEl = document.getElementById('end-share-text');
  if (shareEl) {
    shareEl.value = 'Fed Chair Score: ' + finalScore + '/100 \u2014 ' + verdict.title
      + ' | Infl avg: ' + fmt(avgInfl) + '%'
      + ' | Unemp avg: ' + fmt(avgUnemp) + '%'
      + ' | Seed: ' + (state.seed || 'random');
  }

  var endSeedEl = document.getElementById('end-seed-display');
  if (endSeedEl) endSeedEl.style.display = 'none';

  var achievementsPanel = document.getElementById('end-achievements-panel');
  if (achievementsPanel) achievementsPanel.innerHTML = '';

  renderEndCharts();
  renderEndHistory();
}

function copyResultToClipboard() {
  var shareEl = document.getElementById('end-share-text');
  var text = shareEl ? shareEl.value : 'I completed the Chair the Fed simulation!';
  var btn  = document.getElementById('btn-share-result');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = '\uD83D\uDCCB Copy Result'; }, 1500);
      }
    }).catch(function() { window.prompt('Copy your result:', text); });
  } else {
    window.prompt('Copy your result:', text);
  }
}


/* ==========================================================================
   4. CHART
   Canvas-based main chart and end-screen sparklines.
   ========================================================================== */

var MAIN_CHART_Y_MIN = 0;
var MAIN_CHART_Y_MAX = 10;
var MAIN_CHART_COLORS = {
  inflation:    '#b22222',
  unemployment: '#1a2a4a',
  rate:         '#c8a400',
  grid:         '#d8d1c3',
  axis:         '#5b564b',
  plotBg:       '#fcfbf7',
  frame:        '#cfc7b8'
};

function buildChartPoint(completedQuarter, inflation, unemployment, rate) {
  return { completedQuarter: completedQuarter, inflation: inflation, unemployment: unemployment, rate: rate };
}

function interpolateValue(start, end, progress) {
  return start + (end - start) * progress;
}

function easeSparklineProgress(progress) {
  return 1 - Math.pow(1 - progress, 3);
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
  var rect = canvas.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;
  var dpr    = window.devicePixelRatio || 1;
  var width  = Math.round(rect.width  * dpr);
  var height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width  = width;
    canvas.height = height;
  }
  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, width: rect.width, height: rect.height };
}

function getWorkingChartPoints() {
  var points = (state.chartPoints || [])
    .map(function(point) { return Object.assign({}, point); });

  if (!state.chartAnimation) return points;

  var from     = state.chartAnimation.from;
  var to       = state.chartAnimation.to;
  var progress = state.chartAnimation.progress;

  points.push({
    completedQuarter: interpolateValue(from.completedQuarter, to.completedQuarter, progress),
    inflation:        interpolateValue(from.inflation,        to.inflation,        progress),
    unemployment:     interpolateValue(from.unemployment,     to.unemployment,     progress),
    rate:             interpolateValue(from.rate,             to.rate,             progress)
  });

  return points;
}

function getQuarterAxisLabel(quarterNumber) {
  var info = getQuarterInfo(quarterNumber);
  return quarterNumber % 4 === 1
    ? 'Q' + info.qNum + ' \'' + String(info.year).slice(-2)
    : 'Q' + info.qNum;
}

function drawSharedSeries(ctx, points, accessor, color, toX, toY) {
  if (!points.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 3;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.beginPath();
  points.forEach(function(point, index) {
    var x = toX(point.completedQuarter);
    var y = toY(accessor(point));
    if (index === 0) ctx.moveTo(x, y);
    else             ctx.lineTo(x, y);
  });
  ctx.stroke();
  var lastPoint = points[points.length - 1];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(toX(lastPoint.completedQuarter), toY(accessor(lastPoint)), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// drawLagGhostLine removed — ghost projection line disabled per operator requirement.

function renderMainChart() {
  var canvas = document.getElementById('main-chart');
  var synced = syncCanvasSize(canvas);
  if (!synced) return;

  var ctx    = synced.ctx;
  var width  = synced.width;
  var height = synced.height;
  var plot   = { left: 54, top: 18, right: width - 18, bottom: height - 54 };
  plot.width  = plot.right  - plot.left;
  plot.height = plot.bottom - plot.top;

  var points = getWorkingChartPoints();
  var toX = function(value) { return plot.left + (value / TOTAL_QUARTERS) * plot.width; };
  var toY = function(value) {
    var bounded = Math.max(MAIN_CHART_Y_MIN, Math.min(MAIN_CHART_Y_MAX, value));
    var pct = (bounded - MAIN_CHART_Y_MIN) / (MAIN_CHART_Y_MAX - MAIN_CHART_Y_MIN);
    return plot.bottom - pct * plot.height;
  };

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle   = MAIN_CHART_COLORS.plotBg;
  ctx.fillRect(plot.left, plot.top, plot.width, plot.height);
  ctx.strokeStyle = MAIN_CHART_COLORS.frame;
  ctx.lineWidth   = 1;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);

  ctx.font         = '12px Arial';
  ctx.fillStyle    = MAIN_CHART_COLORS.axis;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';

  for (var value = MAIN_CHART_Y_MIN; value <= MAIN_CHART_Y_MAX; value += 1) {
    var y = toY(value);
    ctx.strokeStyle = value === 0 ? MAIN_CHART_COLORS.frame : MAIN_CHART_COLORS.grid;
    ctx.lineWidth   = value % 2 === 0 ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(plot.left,  y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.fillText(String(value), plot.left - 10, y);
  }

  for (var quarter = 0; quarter <= TOTAL_QUARTERS; quarter += 1) {
    var x = toX(quarter);
    ctx.strokeStyle = quarter === 0 ? MAIN_CHART_COLORS.frame : '#e6dfd2';
    ctx.lineWidth   = quarter % 4 === 0 ? 1 : 0.6;
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

  ctx.font         = '11px Arial';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle    = 'rgba(178, 34, 34, 0.8)';
  ctx.fillText('Inflation Target 2%',    plot.left + 8, toY(TARGET_INFLATION)    - 4);
  ctx.fillStyle = 'rgba(26, 42, 74, 0.8)';
  ctx.fillText('Unemployment Target 5%', plot.left + 8, toY(TARGET_UNEMPLOYMENT) - 4);

  drawSharedSeries(ctx, points, function(p) { return p.inflation;    }, MAIN_CHART_COLORS.inflation,    toX, toY);
  drawSharedSeries(ctx, points, function(p) { return p.unemployment; }, MAIN_CHART_COLORS.unemployment, toX, toY);
  drawSharedSeries(ctx, points, function(p) { return p.rate;         }, MAIN_CHART_COLORS.rate,         toX, toY);

  // Ghost line projection removed — chart shows historical data only.

  ctx.font         = '12px Arial';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = MAIN_CHART_COLORS.axis;
  for (var q = 1; q <= TOTAL_QUARTERS; q += 1) {
    ctx.fillText(getQuarterAxisLabel(q), toX(q), plot.bottom + 10);
  }

  ctx.save();
  ctx.translate(16, plot.top + plot.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font         = '13px Arial';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Percent', 0, 0);
  ctx.restore();
}

function renderSparklines() {
  renderMainChart();
}

function drawEndChart(canvasId, values, target, color, yMin, yMax) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || values.length < 1) return;

  var ctx = canvas.getContext('2d');
  var W   = canvas.width;
  var H   = canvas.height;
  var pad = 6;

  ctx.clearRect(0, 0, W, H);

  var n   = values.length;
  var toX = function(i) { return pad + (i / Math.max(n - 1, 1)) * (W - pad * 2); };
  var toY = function(v) { return pad + (1 - (v - yMin) / (yMax - yMin)) * (H - pad * 2); };

  ctx.save();
  ctx.fillStyle = 'rgba(100,180,100,0.06)';
  ctx.fillRect(pad, toY(target + 0.5), W - pad * 2, toY(target - 0.5) - toY(target + 0.5));
  ctx.restore();

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(pad, toY(target));
  ctx.lineTo(W - pad, toY(target));
  ctx.stroke();
  ctx.restore();

  if (n < 2) return;

  ctx.save();
  ctx.beginPath();
  values.forEach(function(v, i) {
    if (i === 0) ctx.moveTo(toX(i), toY(v));
    else         ctx.lineTo(toX(i), toY(v));
  });
  ctx.lineTo(toX(n - 1), H);
  ctx.lineTo(toX(0), H);
  ctx.closePath();
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  values.forEach(function(v, i) {
    if (i === 0) ctx.moveTo(toX(i), toY(v));
    else         ctx.lineTo(toX(i), toY(v));
  });
  ctx.stroke();

  values.forEach(function(v, i) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(toX(i), toY(v), 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function renderEndCharts() {
  var points      = (state.chartPoints || []).slice(1);
  var startRate   = state.chartPoints && state.chartPoints[0] ? state.chartPoints[0].rate : state.fedRate;
  drawEndChart('end-chart-inflation',    points.map(function(p) { return p.inflation;    }), TARGET_INFLATION,    '#b22222', 0,  8);
  drawEndChart('end-chart-unemployment', points.map(function(p) { return p.unemployment; }), TARGET_UNEMPLOYMENT, '#1a2a4a', 2, 12);
  drawEndChart('end-chart-rate',         points.map(function(p) { return p.rate;         }), startRate,           '#c8a400', 0, 10);
}

function finishMainChartAnimation() {
  if (!state.chartAnimation) return;

  var animation = state.chartAnimation;
  stopMainChartAnimation();

  state.chartPoints.push(animation.to);
  state.inflation    = animation.to.inflation;
  state.unemployment = animation.to.unemployment;
  state.fedRate      = animation.to.rate;

  // Transfer deferred lag and momentum from this quarter's stepEconomy result
  state.lagInflEffect  = animation.nextLagInfl  || 0;
  state.lagUnempEffect = animation.nextLagUnemp || 0;
  state.inflMom        = animation.newInflMom   || 0;
  state.unempMom       = animation.newUnempMom  || 0;

  state.phase = 'result';

  renderIndicators();
  renderHeader();
  renderMainChart();
  renderRateSelector();

  var nextBtn = document.getElementById('btn-next');
  if (nextBtn) {
    nextBtn.disabled = false;
    var limit = state.totalQuarters || TOTAL_QUARTERS;
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
  state.chartAnimation = Object.assign({}, animation, { progress: 0 });

  var nextBtn = document.getElementById('btn-next');
  if (nextBtn) nextBtn.disabled = true;

  renderMainChart();

  var startedAt = performance.now();
  function step(now) {
    if (!state.chartAnimation) return;

    var rawProgress = Math.min(1, (now - startedAt) / GRAPH_ANIMATION_MS);
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


/* ==========================================================================
   5. GAME FLOW
   ========================================================================== */

/** Called by "Random Run →" button and internally for seeded/daily starts */
function startGame(seed) {
  stopMainChartAnimation();

  var s = (seed != null) ? (seed >>> 0) : null;
  state = createInitialState(selectedDifficulty, s);

  document.getElementById('history-tbody').innerHTML     = '';
  document.getElementById('end-history-tbody').innerHTML = '';
  var verdictCard = document.getElementById('end-verdict-card');
  if (verdictCard) verdictCard.querySelectorAll('.end-shock-note').forEach(function(el) { el.remove(); });

  var sandboxBannerEl = document.getElementById('sandbox-banner');
  if (sandboxBannerEl) sandboxBannerEl.style.display = 'none';

  // Show seed in header if a specific seed was provided
  var seedContainer = document.getElementById('hdr-seed-container');
  var seedEl        = document.getElementById('hdr-seed');
  if (seedContainer && seedEl) {
    if (seed != null) {
      seedEl.textContent = state.seed;
      seedContainer.style.display = '';
    } else {
      seedContainer.style.display = 'none';
    }
  }

  showScreen('screen-game');
  beginQuarter();
}

function beginQuarter() {
  stopMainChartAnimation();
  state.phase        = 'decision';
  state.pendingRate  = state.fedRate;
  state.currentEvent = null;   // event fires in makeDecision

  renderHeader();
  renderIndicators();
  renderNews();       // shows routine news; event will show after GO
  renderAdvisors();
  renderMainChart();

  document.getElementById('panel-decision').classList.remove('hidden');
  document.getElementById('panel-result').classList.add('hidden');

  renderRateSelector();
}

/** Process the player's rate decision — runs the real economy simulation */
function makeDecision() {
  if (state.phase !== 'decision') return;

  var previousPoint = state.chartPoints[state.chartPoints.length - 1];
  var rateChange    = Math.round((state.pendingRate - state.fedRate) * 100) / 100;

  var decisionLabel = 'Hold';
  if (rateChange > 0) decisionLabel = 'Raise +' + fmt(rateChange) + '%';
  if (rateChange < 0) decisionLabel = 'Lower \u2212' + fmt(Math.abs(rateChange)) + '%';

  // 1. Select event using events.js selectEvent(rng, diffPreset)
  var diff  = state.diff || DIFFICULTY_PRESETS[state.difficulty] || DIFFICULTY_PRESETS.realworld;
  var event = selectEvent(state.rng, diff);
  state.currentEvent = event;

  var prevInfl  = state.inflation;
  var prevUnemp = state.unemployment;

  // 2. Run economy update — map inflShock/unempShock to inflEffect/unempEffect for engine.js
  var result = stepEconomy(
    prevInfl,
    prevUnemp,
    rateChange,
    state.lagInflEffect,
    state.lagUnempEffect,
    state.inflMom,
    state.unempMom,
    event ? { inflEffect: event.inflShock, unempEffect: event.unempShock } : null,
    diff,
    state.rng
  );

  // 3. Compute quarter penalty and accumulate
  var qPenalty = calcQuarterPenalty(result.newInfl, result.newUnemp);
  state.totalPenalty += qPenalty;

  // 4. Build history record
  var record = {
    quarter:      state.quarter,
    inflation:    result.newInfl,
    unemployment: result.newUnemp,
    rate:         state.pendingRate,
    decision:     decisionLabel,
    eventTitle:   event ? event.title : null,
    penalty:      qPenalty
  };

  state.phase = 'animating';
  state.history.push(record);
  appendHistoryRow(record);

  // 5. Update news panel (now shows the event if one fired)
  renderNews();
  renderResult(rateChange, record, qPenalty, prevInfl, prevUnemp);

  document.getElementById('panel-decision').classList.add('hidden');
  document.getElementById('panel-result').classList.remove('hidden');

  var sideEl = document.querySelector('.panel-side');
  if (sideEl) sideEl.scrollTop = 0;

  var nextBtn = document.getElementById('btn-next');
  if (nextBtn) nextBtn.disabled = true;

  renderIndicators();

  // 6. Animate chart to new economy values, carrying lag/momentum forward
  startMainChartAnimation({
    from:        previousPoint,
    to:          buildChartPoint(state.quarter, result.newInfl, result.newUnemp, state.pendingRate),
    nextLagInfl: result.nextLagInfl,
    nextLagUnemp: result.nextLagUnemp,
    newInflMom:  result.newInflMom,
    newUnempMom: result.newUnempMom,
    qPenalty:    qPenalty
  });
}

function nextQuarter() {
  if (state.phase !== 'result') return;

  var limit = state.totalQuarters || TOTAL_QUARTERS;
  if (state.quarter >= limit) {
    showScreen('screen-end', 'end-score-breakdown');
    renderEndScreen();
    return;
  }

  state.quarter += 1;
  beginQuarter();
}

function resetGame() {
  stopMainChartAnimation();
  closeGameMenu();
  state = {};
  document.getElementById('history-tbody').innerHTML     = '';
  document.getElementById('end-history-tbody').innerHTML = '';
  var verdictCard = document.getElementById('end-verdict-card');
  if (verdictCard) verdictCard.querySelectorAll('.end-shock-note').forEach(function(el) { el.remove(); });
  var sandboxBanner = document.getElementById('sandbox-banner');
  if (sandboxBanner) sandboxBanner.style.display = 'none';
  showScreen('screen-intro');
}

/** Read seed input, parse as integer or hash string, then start game */
function startGameWithSeedInput() {
  var raw = '';
  var inputEl = document.getElementById('seed-input');
  if (inputEl) raw = inputEl.value.trim();
  var seed = null;
  if (raw) {
    var n = Number(raw);
    seed = isNaN(n) ? hashString(raw) : (Math.floor(n) >>> 0);
  }
  startGame(seed);
}

/** Replay the current run with the same seed and difficulty */
function replayWithSameSeed() {
  startGame(state && state.seed != null ? state.seed : null);
}

/** Sandbox mode — extends to 24 quarters after the regular 16 are done */
function startSandboxMode() {
  if (!state || !state.quarter) {
    startGame();
    return;
  }
  state.totalQuarters = 24;
  var sandboxBanner = document.getElementById('sandbox-banner');
  if (sandboxBanner) sandboxBanner.style.display = '';
  if (state.phase === 'result') {
    state.quarter += 1;
  }
  state.phase = 'decision';
  showScreen('screen-game');
  beginQuarter();
}

function startNewRun() {
  resetGame();
}


/* ==========================================================================
   6. MISC — menu, keyboard shortcuts, resize, DOMContentLoaded
   ========================================================================== */

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

// Initialise timeline labels and rate display on load
document.addEventListener('DOMContentLoaded', function() {
  if (!state || !state.quarter) {
    state = { quarter: 1, totalQuarters: TOTAL_QUARTERS };
  }
  renderQuarterProgress();
  // end-final-rate-start is populated by renderEndScreen() with the actual per-game starting rate
});

// Inject rate selector markup into the decision panel
document.addEventListener('DOMContentLoaded', function() {
  var decisionPanel = document.getElementById('panel-decision');
  if (decisionPanel) {
    decisionPanel.innerHTML =
      '<h3 class="panel-title">Set Monetary Policy</h3>' +
      '<p class="decision-prompt">Adjust the federal funds rate, then press <strong>GO</strong> to apply your decision.</p>' +
      '<div class="rate-selector-wrapper">' +
        '<div class="rate-selector-scroll" id="rate-selector-list">' +
          '<!-- Rate options injected by renderRateSelector() -->' +
        '</div>' +
        '<div class="rate-selector-controls">' +
          '<div class="rate-change-summary hold" id="rate-change-summary">Hold steady</div>' +
          '<button class="btn-go" onclick="makeDecision()">GO &rarr;</button>' +
        '</div>' +
      '</div>';
  }
});

// R-key shortcut: press R on the end screen to start a new run
document.addEventListener('keydown', function(e) {
  if (e.key !== 'r' && e.key !== 'R') return;
  var endScreen = document.getElementById('screen-end');
  if (endScreen && endScreen.classList.contains('active')) {
    startNewRun();
  }
});

window.addEventListener('resize', function() {
  var gameScreen = document.getElementById('screen-game');
  var endScreen  = document.getElementById('screen-end');
  if (gameScreen && gameScreen.classList.contains('active')) renderMainChart();
  if (endScreen  && endScreen.classList.contains('active'))  renderEndCharts();
});
