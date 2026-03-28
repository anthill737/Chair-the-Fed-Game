/* ==========================================================================
   CHAIR THE FED — app.js
   Live simulation wired to engine.js (loaded before this file).

   Architecture:
     1. CONSTANTS & EVENTS     — display targets, rate bounds, event pool
     2. GAME STATE             — createInitialState with full sim fields
     3. RENDERING / UI         — DOM updates, news, advisors, rate selector
     4. CHART                  — main chart with lag ghost lines, end-screen
     5. GAME FLOW              — init, makeDecision, nextQuarter, reset
     6. MISC                   — menu, keyboard, resize, DOMContentLoaded
   ========================================================================== */


/* ==========================================================================
   1. CONSTANTS & EVENTS
   ========================================================================== */

// Fed mandate targets — used for display and scoring
const TARGET_INFLATION    = 2.0;
const TARGET_UNEMPLOYMENT = 5.0;

// Rate selector bounds
const RATE_MIN  = 0.00;
const RATE_MAX  = 10.0;
const RATE_STEP = 0.25;

const TOTAL_QUARTERS = 16;
const START_YEAR     = 2014;

const GRAPH_ANIMATION_MS = 1100;

// Difficulty selector descriptions
var DIFFICULTY_DESCRIPTIONS = {
  textbook:  'Forgiving economy with smaller shocks. Good for learning the basics.',
  realworld: 'Calibrated to historical Fed data. The intended experience.',
  crisis:    'Volatile economy. Policy lags hurt more. Not for the faint of heart.'
};

// Tracks difficulty across startGame calls (set by selectDifficulty)
var selectedDifficulty = 'realworld';

/* --------------------------------------------------------------------------
   EVENT POOL
   Each event affects inflation and/or unemployment this quarter.
   Events are selected randomly each quarter based on difficulty.eventFreq.
   -------------------------------------------------------------------------- */
var EVENTS = [
  {
    id: 'oil_collapse',
    title: 'Oil Price Collapse',
    headline: 'Crude oil prices plunge over supply glut concerns',
    newsBody: '<p>Global crude prices have fallen sharply as OPEC maintains production targets despite slowing demand. Energy costs drop across the board, applying downward pressure on headline inflation.</p><p class="news-context">Lower energy prices reduce production costs but may signal weak global demand ahead.</p>',
    badgeText: 'ENERGY SHOCK',
    badgeClass: 'severe',
    alertText: 'Oil prices crash — downward pressure on inflation',
    inflEffect: -0.35,
    unempEffect: +0.15
  },
  {
    id: 'oil_spike',
    title: 'Oil Price Spike',
    headline: 'Energy prices surge amid geopolitical tensions',
    newsBody: '<p>Rising tensions in key oil-producing regions have sent energy prices sharply higher. Businesses and consumers face increased costs, pushing up price pressures across the economy.</p><p class="news-context">Energy shocks often translate to broader inflation within one to two quarters.</p>',
    badgeText: 'ENERGY SHOCK',
    badgeClass: 'severe',
    alertText: 'Oil prices spike — inflation pressure building',
    inflEffect: +0.45,
    unempEffect: +0.20
  },
  {
    id: 'strong_dollar',
    title: 'Strong Dollar Effect',
    headline: 'Dollar strengthens, making imports cheaper',
    newsBody: '<p>The U.S. dollar has appreciated significantly against major trading partners. While cheaper imports benefit consumers, export-dependent industries face pricing pressure and potential layoffs.</p><p class="news-context">Currency strength tends to dampen inflation while creating mixed employment signals.</p>',
    badgeText: 'MARKET UPDATE',
    badgeClass: 'routine',
    alertText: 'Strong dollar — imported inflation eases',
    inflEffect: -0.25,
    unempEffect: +0.10
  },
  {
    id: 'china_slowdown',
    title: 'China Growth Slows',
    headline: 'Chinese economic slowdown rattles global markets',
    newsBody: '<p>Chinese industrial output has come in well below expectations, triggering a broad sell-off in equities and commodity markets. Reduced demand from the world\'s second-largest economy raises concerns about U.S. export growth.</p><p class="news-context">Global slowdowns historically spill into U.S. employment within two to three quarters.</p>',
    badgeText: 'GLOBAL RISK',
    badgeClass: 'moderate',
    alertText: 'China slowdown — global demand weakens',
    inflEffect: -0.20,
    unempEffect: +0.30
  },
  {
    id: 'housing_recovery',
    title: 'Housing Market Surge',
    headline: 'Home construction and sales hit multi-year highs',
    newsBody: '<p>Residential construction permits and existing home sales posted their strongest quarter in years, driven by low mortgage rates and pent-up demand. Housing wealth effects are boosting consumer confidence and spending.</p><p class="news-context">Housing-led recoveries tend to lift employment broadly across construction and services.</p>',
    badgeText: 'POSITIVE DATA',
    badgeClass: 'routine',
    alertText: 'Housing surge — employment boost ahead',
    inflEffect: +0.15,
    unempEffect: -0.30
  },
  {
    id: 'tech_boom',
    title: 'Technology Sector Boom',
    headline: 'Tech hiring accelerates as investment spending surges',
    newsBody: '<p>Major technology companies have announced significant hiring expansions and capital investment plans, citing strong demand for cloud services and digital infrastructure. The sector is pulling workers from across the economy.</p><p class="news-context">Broad-based tech investment can reduce unemployment but also bid up wages, adding mild inflation pressure.</p>',
    badgeText: 'SECTOR NEWS',
    badgeClass: 'routine',
    alertText: 'Tech boom — labor market tightens',
    inflEffect: +0.10,
    unempEffect: -0.40
  },
  {
    id: 'govt_shutdown',
    title: 'Government Shutdown',
    headline: 'Federal government shuts down amid budget deadlock',
    newsBody: '<p>Congress failed to pass a spending bill before the deadline, triggering a partial federal government shutdown. Federal workers face furloughs, government contractors lose business, and consumer confidence dips.</p><p class="news-context">Brief shutdowns typically cause modest, temporary unemployment upticks.</p>',
    badgeText: 'POLICY RISK',
    badgeClass: 'moderate',
    alertText: 'Government shutdown — temporary labor disruption',
    inflEffect: -0.10,
    unempEffect: +0.25
  },
  {
    id: 'europe_crisis',
    title: 'European Debt Stress',
    headline: 'European sovereign debt fears resurface',
    newsBody: '<p>Renewed concerns over European sovereign debt sustainability have rattled financial markets. U.S. equities sold off and credit spreads widened as investors sought safe-haven assets.</p><p class="news-context">Financial stress in major trading partners creates headwinds for U.S. exports and investment.</p>',
    badgeText: 'GLOBAL RISK',
    badgeClass: 'moderate',
    alertText: 'European debt stress — financial headwinds',
    inflEffect: -0.15,
    unempEffect: +0.20
  },
  {
    id: 'wage_growth',
    title: 'Wage Growth Accelerates',
    headline: 'Worker wages rise at fastest pace in years',
    newsBody: '<p>The Labor Department reported that average hourly earnings climbed significantly above trend, signaling tightening labor market conditions. Rising wages both reflect strong demand and push production costs higher.</p><p class="news-context">Accelerating wages can signal a virtuous employment cycle, but persistent gains feed into price levels.</p>',
    badgeText: 'LABOR DATA',
    badgeClass: 'moderate',
    alertText: 'Wage acceleration — inflation and employment signal',
    inflEffect: +0.25,
    unempEffect: -0.20
  },
  {
    id: 'credit_tightening',
    title: 'Credit Market Stress',
    headline: 'Banks tighten lending standards amid rising defaults',
    newsBody: '<p>Major financial institutions have reported tightening credit standards for business and consumer loans, citing rising delinquencies and economic uncertainty. Reduced credit access typically slows investment and hiring.</p><p class="news-context">Credit crunches act as a secondary brake on the economy beyond direct policy effects.</p>',
    badgeText: 'FINANCIAL',
    badgeClass: 'severe',
    alertText: 'Credit tightening — investment and hiring slow',
    inflEffect: -0.20,
    unempEffect: +0.35
  },
  {
    id: 'consumer_confidence',
    title: 'Consumer Confidence Surges',
    headline: 'Confidence index hits post-recession high',
    newsBody: '<p>The Conference Board\'s consumer confidence index surged to its highest reading in years, driven by strong employment and rising household wealth. Increased consumer spending is a key driver of domestic output.</p><p class="news-context">Confidence-driven spending increases typically reduce unemployment while adding modest price pressure.</p>',
    badgeText: 'POSITIVE DATA',
    badgeClass: 'routine',
    alertText: 'Confidence surge — consumer spending lifts economy',
    inflEffect: +0.15,
    unempEffect: -0.25
  },
  {
    id: 'tariff_threat',
    title: 'Trade Policy Uncertainty',
    headline: 'Proposed tariffs raise business investment concerns',
    newsBody: '<p>Proposals for sweeping tariffs on imported goods have sent a chill through business planning. Companies are delaying capital investment decisions while supply chains brace for higher input costs.</p><p class="news-context">Trade uncertainty typically damps investment and raises the costs of goods with imported components.</p>',
    badgeText: 'TRADE RISK',
    badgeClass: 'moderate',
    alertText: 'Trade uncertainty — investment pause, cost pressures',
    inflEffect: +0.30,
    unempEffect: +0.15
  }
];

/**
 * Select an event for this quarter.
 * Returns an event object or null.
 * @param {function} rng  — seeded PRNG from mulberry32
 * @param {object}   diff — DIFFICULTY_PRESETS entry
 */
function selectEvent(rng, diff) {
  if (rng() >= diff.eventFreq) return null;
  var idx = Math.floor(rng() * EVENTS.length);
  return EVENTS[idx % EVENTS.length];
}

/**
 * Generate a dynamic routine news body based on current conditions.
 * Used when no event fires for the quarter.
 */
function getRoutineNewsBody(inflation, unemployment, fedRate) {
  var inflGap  = inflation    - TARGET_INFLATION;
  var unempGap = unemployment - TARGET_UNEMPLOYMENT;

  var inflDesc  = Math.abs(inflGap)  <= 0.3 ? 'near its 2% target' :
                  inflGap  > 0 ? 'running above the 2% target at ' + fmt(inflation) + '%' :
                                 'below the 2% target at ' + fmt(inflation) + '%';
  var unempDesc = Math.abs(unempGap) <= 0.3 ? 'near its natural rate of 5%' :
                  unempGap > 0 ? 'elevated at ' + fmt(unemployment) + '%' :
                                 'tight at ' + fmt(unemployment) + '%';

  var outlook;
  if (Math.abs(inflGap) <= 0.5 && Math.abs(unempGap) <= 0.5) {
    outlook = 'Economic conditions remain balanced. Both mandates are near target.';
  } else if (inflGap > 1.0 && unempGap < -0.5) {
    outlook = 'The economy is running hot. High inflation and tight labor markets suggest policy may need to tighten.';
  } else if (inflGap < -0.5 && unempGap > 1.0) {
    outlook = 'The economy shows slack. Low inflation and elevated unemployment suggest room for accommodation.';
  } else if (inflGap > 0.5) {
    outlook = 'Price pressures remain elevated. Monitoring inflation closely.';
  } else if (unempGap > 0.5) {
    outlook = 'Labor market weakness persists. Employment remains below its natural rate.';
  } else {
    outlook = 'The economy is evolving broadly in line with expectations.';
  }

  return '<p>' + outlook + '</p>' +
         '<p class="news-context">Inflation is ' + inflDesc + '. Unemployment is ' + unempDesc +
         '. The federal funds rate stands at ' + fmt(fedRate) + '%.</p>';
}


/* ==========================================================================
   2. GAME STATE
   ========================================================================== */

/**
 * Create the initial game state for a new run.
 * @param {string} difficulty — 'textbook' | 'realworld' | 'crisis'
 * @param {number|null} seed  — integer seed for the PRNG (null = random)
 */
function createInitialState(difficulty, seed) {
  var diff    = difficulty || 'realworld';
  var s       = (seed != null) ? (seed >>> 0) : (Math.floor(Math.random() * 0x100000000) >>> 0);
  var rng     = mulberry32(s);
  var initial = getInitialConditions(diff);

  return {
    quarter:          1,
    inflation:        initial.inflation,
    unemployment:     initial.unemployment,
    fedRate:          initial.fedRate,
    pendingRate:      initial.fedRate,

    // Simulation fields
    difficulty:       diff,
    seed:             s,
    rng:              rng,
    lagInflEffect:    0,       // deferred inflation effect from prior quarter
    lagUnempEffect:   0,       // deferred unemployment effect from prior quarter
    inflMomentum:     0,       // momentum: last quarter's inflation Δ
    unempMomentum:    0,       // momentum: last quarter's unemployment Δ
    nextLagInfl:      0,       // lag computed this quarter, applied after animation
    nextLagUnemp:     0,       // lag computed this quarter, applied after animation
    nextInflMom:      0,       // momentum update, applied after animation
    nextUnempMom:     0,       // momentum update, applied after animation
    totalPenalty:     0,       // cumulative sum of quarter penalties
    currentEvent:     null,    // event that fired this quarter (set in makeDecision)

    // UI state
    phase:            'decision',   // 'decision' | 'animating' | 'result'
    history:          [],
    chartPoints:      [buildChartPoint(0, initial.inflation, initial.unemployment, initial.fedRate)],
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
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
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
 * Render the news panel.
 * If state.currentEvent is set, show event details with alert banner.
 * Otherwise render a routine briefing based on current economic conditions.
 */
function renderNews() {
  var quarterInfo = getQuarterInfo(state.quarter || 1);
  var label = document.getElementById('news-quarter-label');
  var badge = document.getElementById('news-badge');
  var body  = document.getElementById('news-body');
  var alert = document.getElementById('news-alert');

  if (label) label.textContent = quarterInfo.label + ' \u2014 Economic Briefing';

  var evt = state.currentEvent;

  if (evt) {
    // Show event
    if (badge) {
      badge.textContent = evt.badgeText;
      badge.className   = 'news-badge ' + (evt.badgeClass || 'routine');
    }
    if (body) body.innerHTML = evt.newsBody;
    if (alert) {
      alert.classList.remove('hidden', 'news-alert--flash', 'news-alert--panic');
      var alertHeadline = document.getElementById('news-alert-headline');
      var alertText     = document.getElementById('news-alert-text');
      if (alertHeadline) alertHeadline.textContent = evt.headline;
      if (alertText)     alertText.textContent     = evt.alertText || '';
      // Flash animation — remove class after 850ms
      setTimeout(function() {
        if (alert) alert.classList.add('news-alert--flash');
      }, 0);
    }
  } else {
    // Routine briefing
    if (badge) { badge.textContent = 'MARKET UPDATE'; badge.className = 'news-badge routine'; }
    if (body)  body.innerHTML = getRoutineNewsBody(state.inflation, state.unemployment, state.fedRate);
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

/** Advisor definitions — rationale is generated dynamically */
var ADVISORS = [
  { name: 'Dr. Chen',    title: 'Chief Economist', avatar: 'C', role: 'hawk'  },
  { name: 'Gov. Rivera', title: 'Board Governor',  avatar: 'R', role: 'balanced' },
  { name: 'Sec. Park',   title: 'Market Analyst',  avatar: 'P', role: 'dove'  }
];

/**
 * Compute advisor recommendation and rationale based on current conditions.
 * Returns { rec: 'Raise'|'Lower'|'Hold', rationale: string }
 */
function getAdvisorRec(advisor, inflation, unemployment, fedRate) {
  var inflGap  = inflation    - TARGET_INFLATION;    // positive = above target
  var unempGap = unemployment - TARGET_UNEMPLOYMENT; // positive = above target (slack)
  var rec, rationale;

  if (advisor.role === 'hawk') {
    // Dr. Chen focuses on inflation
    if (inflGap > 0.5) {
      rec = 'Raise';
      rationale = 'Inflation at ' + fmt(inflation) + '% is above the 2% target — tightening is warranted.';
    } else if (inflGap < -0.5) {
      rec = 'Lower';
      rationale = 'Inflation at ' + fmt(inflation) + '% is running below target — accommodation is appropriate.';
    } else {
      rec = 'Hold';
      rationale = 'Inflation at ' + fmt(inflation) + '% is near target — hold and monitor.';
    }
  } else if (advisor.role === 'balanced') {
    // Gov. Rivera weighs both mandates
    if (inflGap > 1.0 || (inflGap > 0.5 && unempGap < 0.5)) {
      rec = 'Raise';
      rationale = 'Elevated inflation (' + fmt(inflation) + '%) with near-full employment warrants tightening.';
    } else if (unempGap > 1.5 || inflGap < -1.0) {
      rec = 'Lower';
      rationale = 'Unemployment at ' + fmt(unemployment) + '% and low inflation leave room to ease policy.';
    } else {
      rec = 'Hold';
      rationale = 'Both mandates are reasonably close to target — patience is the prudent course.';
    }
  } else {
    // Sec. Park focuses on employment
    if (unempGap > 0.5) {
      rec = 'Lower';
      rationale = 'Unemployment at ' + fmt(unemployment) + '% is above the natural rate — easier policy can help.';
    } else if (unempGap < -0.5 && inflGap > 0.5) {
      rec = 'Raise';
      rationale = 'Very tight labor market (' + fmt(unemployment) + '%) with rising prices — modest tightening prudent.';
    } else {
      rec = 'Hold';
      rationale = 'Labor market is near full employment — hold rates steady at ' + fmt(fedRate) + '%.';
    }
  }

  return { rec: rec, rationale: rationale };
}

/** Render the advisor panel with dynamic recommendations */
function renderAdvisors() {
  var container = document.getElementById('advisors-list');
  if (!container) return;

  container.innerHTML = ADVISORS.map(function(advisor) {
    var advice = getAdvisorRec(advisor, state.inflation, state.unemployment, state.fedRate);
    var recClass = advice.rec === 'Raise' ? 'advisor-rec--raise' :
                   advice.rec === 'Lower' ? 'advisor-rec--lower' :
                                             'advisor-rec--hold';
    return '<div class="advisor-card advisor-card--calm">'
      + '<div class="advisor-avatar">' + advisor.avatar + '</div>'
      + '<div class="advisor-content">'
      + '<div class="advisor-header-row">'
      + '<span class="advisor-name">' + advisor.name + '</span>'
      + '<span class="advisor-title-text">' + advisor.title + '</span>'
      + '<span class="advisor-rec ' + recClass + '">' + advice.rec + '</span>'
      + '</div>'
      + '<div class="advisor-rationale">' + advice.rationale + '</div>'
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
 * Render the result panel after a decision.
 * @param {number} rateDelta  — rate change this quarter
 * @param {object} record     — history record with newInfl, newUnemp, rate
 * @param {number} qPenalty   — quarter penalty score
 * @param {number} prevInfl   — inflation before update
 * @param {number} prevUnemp  — unemployment before update
 */
function renderResult(rateDelta, record, qPenalty, prevInfl, prevUnemp) {
  var body = document.getElementById('result-body');

  var decisionText = Math.abs(rateDelta) < 0.001
    ? 'You held the rate steady at ' + fmt(state.fedRate) + '%.'
    : rateDelta > 0
    ? 'You raised the rate by ' + fmt(rateDelta) + '% to ' + fmt(state.pendingRate) + '%.'
    : 'You lowered the rate by ' + fmt(Math.abs(rateDelta)) + '% to ' + fmt(state.pendingRate) + '%.';

  var inflDelta  = record ? record.inflation    - prevInfl  : 0;
  var unempDelta = record ? record.unemployment - prevUnemp : 0;

  var inflArrow  = Math.abs(inflDelta)  < 0.005 ? '' : (inflDelta  > 0 ? ' \u25b2 +' : ' \u25bc ') + fmt(Math.abs(inflDelta));
  var unempArrow = Math.abs(unempDelta) < 0.005 ? '' : (unempDelta > 0 ? ' \u25b2 +' : ' \u25bc ') + fmt(Math.abs(unempDelta));

  var newInfl  = record ? record.inflation    : state.inflation;
  var newUnemp = record ? record.unemployment : state.unemployment;

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

/** Render the end screen with real scoring and verdict */
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

  // Summary stats
  var avgInfl  = 0, avgUnemp = 0;
  if (history.length > 0) {
    for (var i = 0; i < history.length; i++) {
      avgInfl  += history[i].inflation;
      avgUnemp += history[i].unemployment;
    }
    avgInfl  /= history.length;
    avgUnemp /= history.length;
  }
  var finalRate = history.length > 0 ? history[history.length - 1].rate : state.fedRate;

  var avgInflEl  = document.getElementById('end-avg-infl');
  var avgUnempEl = document.getElementById('end-avg-unemp');
  var finalRateEl     = document.getElementById('end-final-rate');
  var finalRateStartEl = document.getElementById('end-final-rate-start');
  var initial = getInitialConditions(state.difficulty || 'realworld');

  if (avgInflEl)  {
    avgInflEl.textContent = fmt(avgInfl) + '%';
    setIndicatorClass(avgInflEl, avgInfl, TARGET_INFLATION, 0.5, 1.5);
  }
  if (avgUnempEl) {
    avgUnempEl.textContent = fmt(avgUnemp) + '%';
    setIndicatorClass(avgUnempEl, avgUnemp, TARGET_UNEMPLOYMENT, 0.5, 1.5);
  }
  if (finalRateEl)      finalRateEl.textContent      = fmt(finalRate) + '%';
  if (finalRateStartEl) finalRateStartEl.textContent = 'Started: ' + fmt(initial.fedRate) + '%';

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
        + ' &mdash; ' + fmt(bestWorst.best.penalty, 2) + ' pts penalty'
        + '</div>'
        + '<div class="end-best-worst-item">'
        + '<span class="end-bw-label">Worst Quarter</span> '
        + '<span class="end-bw-val cell-high">' + worstInfo.label + '</span>'
        + ' &mdash; ' + fmt(bestWorst.worst.penalty, 2) + ' pts penalty'
        + '</div>';
    } else {
      bestWorstEl.innerHTML = '';
    }
  }

  // Score breakdown by dimension
  var breakdownEl = document.getElementById('end-score-breakdown');
  if (breakdownEl) {
    var inflPenaltyTotal = 0, unempPenaltyTotal = 0;
    for (var j = 0; j < history.length; j++) {
      inflPenaltyTotal  += Math.abs(history[j].inflation    - TARGET_INFLATION);
      unempPenaltyTotal += Math.abs(history[j].unemployment - TARGET_UNEMPLOYMENT);
    }
    var n = history.length || 1;
    var inflScore  = Math.max(0, Math.round(100 - (inflPenaltyTotal  / n / 2.5) * 100));
    var unempScore = Math.max(0, Math.round(100 - (unempPenaltyTotal / n / 2.5) * 100));
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

  // Seed display
  var endSeedEl = document.getElementById('end-seed-display');
  if (endSeedEl) endSeedEl.style.display = 'none';

  // Achievements placeholder (kept empty for now)
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
   Canvas-based main chart and end-screen charts.
   ========================================================================== */

const MAIN_CHART_Y_MIN = 0;
const MAIN_CHART_Y_MAX = 10;
const MAIN_CHART_COLORS = {
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

/**
 * Draw a dashed ghost line projecting one quarter forward, showing pending lag effect.
 * Called from renderMainChart during the result phase.
 */
function drawLagGhostLine(ctx, currentQuarter, currentValue, lagEffect, color, toX, toY) {
  if (Math.abs(lagEffect) < 0.01) return;
  if (state.phase === 'animating') return;

  var projectedValue = currentValue + lagEffect;

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle  = color;
  ctx.globalAlpha  = 0.45;
  ctx.lineWidth    = 2;
  ctx.lineCap      = 'round';

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

  ctx.font         = '11px Arial';
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

  ctx.font         = '10px Arial';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle    = 'rgba(178, 34, 34, 0.8)';
  ctx.fillText('Inflation Target 2%',    plot.left + 8, toY(TARGET_INFLATION)    - 4);
  ctx.fillStyle = 'rgba(26, 42, 74, 0.8)';
  ctx.fillText('Unemployment Target 5%', plot.left + 8, toY(TARGET_UNEMPLOYMENT) - 4);

  drawSharedSeries(ctx, points, function(p) { return p.inflation;    }, MAIN_CHART_COLORS.inflation,    toX, toY);
  drawSharedSeries(ctx, points, function(p) { return p.unemployment; }, MAIN_CHART_COLORS.unemployment, toX, toY);
  drawSharedSeries(ctx, points, function(p) { return p.rate;         }, MAIN_CHART_COLORS.rate,         toX, toY);

  // Draw policy lag ghost lines during result phase
  if (state.phase === 'result' && state.chartPoints && state.chartPoints.length > 0) {
    var lastPt  = state.chartPoints[state.chartPoints.length - 1];
    var currQ   = lastPt.completedQuarter;
    drawLagGhostLine(ctx, currQ, lastPt.inflation,    state.lagInflEffect,  'rgba(178, 34, 34, 0.7)',  toX, toY);
    drawLagGhostLine(ctx, currQ, lastPt.unemployment, state.lagUnempEffect, 'rgba(26, 42, 74, 0.7)',   toX, toY);
  }

  ctx.font         = '11px Arial';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = MAIN_CHART_COLORS.axis;
  for (var q = 1; q <= TOTAL_QUARTERS; q += 1) {
    ctx.fillText(getQuarterAxisLabel(q), toX(q), plot.bottom + 10);
  }

  ctx.save();
  ctx.translate(16, plot.top + plot.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font         = '12px Arial';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Percent', 0, 0);
  ctx.restore();
}

/** renderSparklines is called in some paths — delegate to renderMainChart */
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

  // Background target zone
  ctx.save();
  ctx.fillStyle = 'rgba(100,180,100,0.06)';
  ctx.fillRect(pad, toY(target + 0.5), W - pad * 2, toY(target - 0.5) - toY(target + 0.5));
  ctx.restore();

  // Target dashed line
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

  // Area fill
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

  // Line
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

  // Dots
  values.forEach(function(v, i) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(toX(i), toY(v), 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function renderEndCharts() {
  var points = (state.chartPoints || []).slice(1);
  drawEndChart('end-chart-inflation',    points.map(function(p) { return p.inflation;    }), TARGET_INFLATION,    '#b22222', 0,  8);
  drawEndChart('end-chart-unemployment', points.map(function(p) { return p.unemployment; }), TARGET_UNEMPLOYMENT, '#1a2a4a', 2, 12);
  drawEndChart('end-chart-rate',         points.map(function(p) { return p.rate;         }), getInitialConditions(state.difficulty || 'realworld').fedRate, '#c8a400', 0, 10);
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
  state.inflMomentum   = animation.newInflMom   || 0;
  state.unempMomentum  = animation.newUnempMom  || 0;

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

/** Called by "Random Run →" button and internally */
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
  state.phase       = 'decision';
  state.pendingRate = state.fedRate;
  state.currentEvent = null;   // event fires in makeDecision

  renderHeader();
  renderIndicators();
  renderNews();       // shows routine news until event fires
  renderAdvisors();
  renderMainChart();

  document.getElementById('panel-decision').classList.remove('hidden');
  document.getElementById('panel-result').classList.add('hidden');

  renderRateSelector();
}

/** Process the player's rate decision — calls engine for real economy update */
function makeDecision() {
  if (state.phase !== 'decision') return;

  var previousPoint = state.chartPoints[state.chartPoints.length - 1];
  var rateChange    = Math.round((state.pendingRate - state.fedRate) * 100) / 100;

  var decisionLabel = 'Hold';
  if (rateChange > 0) decisionLabel = 'Raise +' + fmt(rateChange) + '%';
  if (rateChange < 0) decisionLabel = 'Lower \u2212' + fmt(Math.abs(rateChange)) + '%';

  // Select event for this quarter
  var diff  = DIFFICULTY_PRESETS[state.difficulty] || DIFFICULTY_PRESETS.realworld;
  var event = selectEvent(state.rng, diff);
  state.currentEvent = event;

  // Run the economy update
  var prevInfl  = state.inflation;
  var prevUnemp = state.unemployment;

  var result = stepEconomy(
    prevInfl,
    prevUnemp,
    rateChange,
    state.lagInflEffect,
    state.lagUnempEffect,
    state.inflMomentum,
    state.unempMomentum,
    event,
    diff,
    state.rng
  );

  // Compute quarter penalty and accumulate
  var qPenalty = calcQuarterPenalty(result.newInfl, result.newUnemp);
  state.totalPenalty += qPenalty;

  // Build history record
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

  renderNews();       // now shows event if one fired
  renderResult(rateChange, record, qPenalty, prevInfl, prevUnemp);

  document.getElementById('panel-decision').classList.add('hidden');
  document.getElementById('panel-result').classList.remove('hidden');

  var sideEl = document.querySelector('.panel-side');
  if (sideEl) sideEl.scrollTop = 0;

  var nextBtn = document.getElementById('btn-next');
  if (nextBtn) nextBtn.disabled = true;

  renderIndicators();

  // Animate chart to new economy values
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

/** Update the active difficulty and description text */
function selectDifficulty(key) {
  selectedDifficulty = key;
  document.querySelectorAll('.btn-difficulty').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.diff === key);
  });
  var descEl = document.getElementById('difficulty-description');
  if (descEl) descEl.textContent = DIFFICULTY_DESCRIPTIONS[key] || '';
  // If a game is in progress, update state.difficulty too
  if (state && state.difficulty !== undefined) {
    state.difficulty = key;
  }
}

/**
 * getDailySeed is provided by engine.js and available as a global.
 * This wrapper ensures it's always available even if engine.js loads after.
 */
function getDailySeed() {
  // engine.js defines getDailySeed() — if both are loaded, the engine version
  // would be shadowed. We re-expose it here to keep the HTML onclick working.
  var d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Read #seed-input, parse seed, and start game */
function startGameWithSeedInput() {
  var raw = (document.getElementById('seed-input') || {}).value;
  raw = raw ? raw.trim() : '';
  var seed = null;
  if (raw) {
    var n = Number(raw);
    seed = isNaN(n) ? hashString(raw) : (Math.floor(n) >>> 0);
  }
  startGame(seed);
}

/** Replay the current run with the same seed */
function replayWithSameSeed() {
  startGame(state && state.seed != null ? state.seed : null);
}

/** Sandbox mode — extends to 24 quarters */
function startSandboxMode() {
  if (!state || !state.quarter) {
    startGame();
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

// Initialise timeline labels on load
document.addEventListener('DOMContentLoaded', function() {
  // Set up minimal state for progress rendering before first game
  if (!state || !state.quarter) {
    state = { quarter: 1, totalQuarters: TOTAL_QUARTERS };
  }
  renderQuarterProgress();
  var endStart = document.getElementById('end-final-rate-start');
  if (endStart) endStart.textContent = 'Started: ' + fmt(getInitialConditions(selectedDifficulty).fedRate) + '%';
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
