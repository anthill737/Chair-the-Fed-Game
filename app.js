/* ==========================================================================
   CHAIR THE FED — app.js
   Static UI Shell — all gameplay simulation removed.

   Economic values are frozen constants. Nothing changes over time.
   Buttons work visually but have no effect on the economy.

   Architecture:
     1. CONSTANTS           — display targets and static values
     2. GAME STATE          — minimal static state, no simulation fields
     3. RENDERING / UI      — DOM updates, advisors, news, rate selector
     4. CHART               — main chart and end-screen charts
     5. GAME FLOW           — init, decision (no-op), next quarter, reset
     6. MISC                — menu, keyboard, resize, DOMContentLoaded
   ========================================================================== */


/* ==========================================================================
   1. CONSTANTS
   ========================================================================== */

// Fed mandate targets (display only — not used in simulation)
const TARGET_INFLATION    = 2.0;
const TARGET_UNEMPLOYMENT = 5.0;

// Static economic values — these NEVER change
const STATIC_INFLATION    = 2.0;
const STATIC_UNEMPLOYMENT = 5.0;
const STATIC_RATE         = 2.5;

// Rate selector bounds (display only)
const RATE_MIN  = 0.25;
const RATE_MAX  = 10.0;
const RATE_STEP = 0.25;

const TOTAL_QUARTERS = 16;
const START_YEAR     = 2014;

const GRAPH_ANIMATION_MS = 1100;


/* ==========================================================================
   2. GAME STATE
   Minimal — no simulation fields (lag, drift, noise, shocks, scoring).
   ========================================================================== */

let state = {};

function createInitialState() {
  return {
    quarter:          1,
    inflation:        STATIC_INFLATION,
    unemployment:     STATIC_UNEMPLOYMENT,
    fedRate:          STATIC_RATE,
    pendingRate:      STATIC_RATE,
    history:          [],
    phase:            'decision',   // 'decision' | 'animating' | 'result'
    chartPoints:      [buildChartPoint(0, STATIC_INFLATION, STATIC_UNEMPLOYMENT, STATIC_RATE)],
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

/** Update the game header (quarter counter — no score in static shell) */
function renderHeader() {
  var totalQ  = state.totalQuarters || TOTAL_QUARTERS;
  document.getElementById('hdr-quarter').textContent =
    (state.quarter || 1) + ' / ' + totalQ;

  var scoreEl = document.getElementById('hdr-score');
  if (scoreEl) {
    scoreEl.textContent = '\u2014';
    scoreEl.classList.remove('hdr-score--good', 'hdr-score--ok', 'hdr-score--poor');
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

/** Render a static news briefing — no shocks, no dynamic headlines */
function renderNews() {
  var quarterInfo = getQuarterInfo(state.quarter || 1);
  var label = document.getElementById('news-quarter-label');
  var badge = document.getElementById('news-badge');
  var body  = document.getElementById('news-body');
  var alert = document.getElementById('news-alert');

  if (label) label.textContent = quarterInfo.label + ' \u2014 Economic Briefing';
  if (badge) { badge.textContent = 'MARKET UPDATE'; badge.className = 'news-badge routine'; }
  if (body) {
    body.innerHTML =
      '<p>Economic conditions remain stable. The labor market is healthy and price pressures are contained.</p>' +
      '<p class="news-context">Inflation is near the Fed\u2019s 2% target. Unemployment is near its natural rate of 5%.</p>';
  }
  if (alert) {
    alert.classList.add('hidden');
    alert.classList.remove('news-alert--flash', 'news-alert--panic');
    var alertHeadline = document.getElementById('news-alert-headline');
    var alertText     = document.getElementById('news-alert-text');
    if (alertHeadline) alertHeadline.textContent = '';
    if (alertText)     alertText.textContent     = '';
  }

  var shockBannerEl = document.getElementById('shock-status-banner');
  if (shockBannerEl) shockBannerEl.style.display = 'none';
}

/** Static advisor panel — all advisors recommend Hold */
var ADVISORS = [
  { name: 'Dr. Chen',    title: 'Chief Economist', avatar: 'C' },
  { name: 'Gov. Rivera', title: 'Board Governor',  avatar: 'R' },
  { name: 'Sec. Park',   title: 'Market Analyst',  avatar: 'P' }
];

function renderAdvisors() {
  var container = document.getElementById('advisors-list');
  if (!container) return;
  container.innerHTML = ADVISORS.map(function(advisor) {
    return '<div class="advisor-card advisor-card--calm">'
      + '<div class="advisor-avatar">' + advisor.avatar + '</div>'
      + '<div class="advisor-content">'
      + '<div class="advisor-header-row">'
      + '<span class="advisor-name">' + advisor.name + '</span>'
      + '<span class="advisor-title-text">' + advisor.title + '</span>'
      + '<span class="advisor-rec advisor-rec--hold">Hold</span>'
      + '</div>'
      + '<div class="advisor-rationale">Economic conditions are stable. Hold rates steady at '
      + fmt(STATIC_RATE) + '%.</div>'
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

/** Render the result panel after a decision */
function renderResult(rateDelta) {
  var body = document.getElementById('result-body');

  var decisionText = Math.abs(rateDelta) < 0.001
    ? 'You held the rate steady at ' + fmt(state.fedRate) + '%.'
    : rateDelta > 0
    ? 'You raised the rate by ' + fmt(rateDelta) + '% to ' + fmt(state.pendingRate) + '%.'
    : 'You lowered the rate by ' + fmt(Math.abs(rateDelta)) + '% to ' + fmt(state.pendingRate) + '%.';

  if (body) {
    body.innerHTML =
      '<p style="margin-bottom:10px;">' + decisionText + '</p>' +
      '<div class="result-stat">' +
        '<span class="label">Inflation</span>' +
        '<span>' + fmt(STATIC_INFLATION) + '% <span style="color:#888;font-size:0.78rem;">(target 2.0%)</span></span>' +
      '</div>' +
      '<div class="result-stat">' +
        '<span class="label">Unemployment</span>' +
        '<span>' + fmt(STATIC_UNEMPLOYMENT) + '% <span style="color:#888;font-size:0.78rem;">(target 5.0%)</span></span>' +
      '</div>' +
      '<div class="result-stat">' +
        '<span class="label">Fed Funds Rate</span>' +
        '<span>' + fmt(STATIC_RATE) + '%</span>' +
      '</div>';
  }

  var qs = document.getElementById('result-quarter-score');
  if (qs) { qs.textContent = ''; qs.style.color = ''; }

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

/** Render the end screen — no scoring, no verdict, no achievements */
function renderEndScreen() {
  var card = document.getElementById('end-verdict-card');
  if (card) {
    card.className = 'end-verdict-card good';
    card.querySelectorAll('.end-shock-note').forEach(function(el) { el.remove(); });
  }

  var titleEl = document.getElementById('end-verdict-title');
  if (titleEl) titleEl.textContent = 'Simulation Complete';

  var scoreEl = document.getElementById('end-score');
  if (scoreEl) scoreEl.textContent = '\u2014';

  var subtitleEl = document.getElementById('end-verdict-subtitle');
  if (subtitleEl) subtitleEl.textContent = 'Stable Economy';

  var textEl = document.getElementById('end-verdict-text');
  if (textEl) {
    textEl.textContent =
      'You have completed your term as Federal Reserve Chair. ' +
      'Economic conditions remained stable throughout your tenure.';
  }

  var avgInflEl       = document.getElementById('end-avg-infl');
  var avgUnempEl      = document.getElementById('end-avg-unemp');
  var finalRateEl     = document.getElementById('end-final-rate');
  var finalRateStartEl = document.getElementById('end-final-rate-start');

  if (avgInflEl) {
    avgInflEl.textContent = fmt(STATIC_INFLATION) + '%';
    setIndicatorClass(avgInflEl, STATIC_INFLATION, TARGET_INFLATION, 0.5, 1.5);
  }
  if (avgUnempEl) {
    avgUnempEl.textContent = fmt(STATIC_UNEMPLOYMENT) + '%';
    setIndicatorClass(avgUnempEl, STATIC_UNEMPLOYMENT, TARGET_UNEMPLOYMENT, 0.5, 1.5);
  }
  if (finalRateEl)      finalRateEl.textContent      = fmt(STATIC_RATE) + '%';
  if (finalRateStartEl) finalRateStartEl.textContent = 'Started: ' + fmt(STATIC_RATE) + '%';

  var softEl = document.getElementById('end-soft-landing');
  if (softEl) {
    var valEl = softEl.querySelector('.end-soft-landing-value');
    if (valEl) {
      valEl.textContent  = 'Yes \u2014 Achieved!';
      valEl.style.color  = '#1a6b1a';
      valEl.style.fontWeight = 'bold';
    }
  }

  var bestWorstEl = document.getElementById('end-best-worst');
  if (bestWorstEl) bestWorstEl.innerHTML = '';

  var breakdownEl = document.getElementById('end-score-breakdown');
  if (breakdownEl) breakdownEl.innerHTML = '';

  var achievementsPanel = document.getElementById('end-achievements-panel');
  if (achievementsPanel) achievementsPanel.innerHTML = '';

  var shareEl = document.getElementById('end-share-text');
  if (shareEl) shareEl.value = 'I completed the Chair the Fed simulation!';

  var endSeedEl = document.getElementById('end-seed-display');
  if (endSeedEl) endSeedEl.style.display = 'none';

  renderEndCharts();
  renderEndHistory();
}

function copyResultToClipboard() {
  var text = 'I completed the Chair the Fed simulation!';
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
   Values never change so lines are flat, but chart infrastructure is intact.
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
  var points = (state.chartPoints || [buildChartPoint(0, STATIC_INFLATION, STATIC_UNEMPLOYMENT, STATIC_RATE)])
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
  drawEndChart('end-chart-rate',         points.map(function(p) { return p.rate;         }), STATIC_RATE,         '#c8a400', 0, 10);
}

function finishMainChartAnimation() {
  if (!state.chartAnimation) return;

  var animation = state.chartAnimation;
  stopMainChartAnimation();

  state.chartPoints.push(animation.to);
  state.inflation    = animation.to.inflation;
  state.unemployment = animation.to.unemployment;
  state.fedRate      = animation.to.rate;
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
   Buttons work visually but economic values never change.
   ========================================================================== */

/** Called by "Begin Simulation" button on the intro screen */
function startGame() {
  stopMainChartAnimation();
  state = createInitialState();
  document.getElementById('history-tbody').innerHTML     = '';
  document.getElementById('end-history-tbody').innerHTML = '';
  var verdictCard = document.getElementById('end-verdict-card');
  if (verdictCard) verdictCard.querySelectorAll('.end-shock-note').forEach(function(el) { el.remove(); });

  var sandboxBannerEl = document.getElementById('sandbox-banner');
  if (sandboxBannerEl) sandboxBannerEl.style.display = 'none';

  var seedContainer = document.getElementById('hdr-seed-container');
  if (seedContainer) seedContainer.style.display = 'none';

  showScreen('screen-game');
  beginQuarter();
}

function beginQuarter() {
  stopMainChartAnimation();
  state.phase       = 'decision';
  state.pendingRate = state.fedRate;

  renderHeader();
  renderIndicators();
  renderNews();
  renderAdvisors();
  renderMainChart();

  document.getElementById('panel-decision').classList.remove('hidden');
  document.getElementById('panel-result').classList.add('hidden');

  renderRateSelector();
}

/** Process the player's rate decision.
 *  Records the decision but economic values NEVER change. */
function makeDecision() {
  if (state.phase !== 'decision') return;

  var previousPoint = state.chartPoints[state.chartPoints.length - 1];
  var rateDelta     = Math.round((state.pendingRate - state.fedRate) * 100) / 100;

  var decisionLabel = 'Hold';
  if (rateDelta > 0) decisionLabel = 'Raise +' + fmt(rateDelta) + '%';
  if (rateDelta < 0) decisionLabel = 'Lower -' + fmt(Math.abs(rateDelta)) + '%';

  // Record the decision — inflation, unemployment, and rate never change
  var record = {
    quarter:      state.quarter,
    inflation:    STATIC_INFLATION,
    unemployment: STATIC_UNEMPLOYMENT,
    rate:         STATIC_RATE,
    decision:     decisionLabel,
    eventTitle:   null
  };

  state.phase = 'animating';
  state.history.push(record);
  appendHistoryRow(record);

  renderResult(rateDelta);
  document.getElementById('panel-decision').classList.add('hidden');
  document.getElementById('panel-result').classList.remove('hidden');

  var sideEl = document.querySelector('.panel-side');
  if (sideEl) sideEl.scrollTop = 0;

  var nextBtn = document.getElementById('btn-next');
  if (nextBtn) nextBtn.disabled = true;

  renderIndicators();

  // Animate the chart — always to the same static values (flat line)
  startMainChartAnimation({
    from:         previousPoint,
    to:           buildChartPoint(state.quarter, STATIC_INFLATION, STATIC_UNEMPLOYMENT, STATIC_RATE),
    nextLagInfl:  0,
    nextLagUnemp: 0,
    qPenalty:     0
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

/** Called by difficulty selector buttons — no-op in static shell (UI only) */
function selectDifficulty(key) {
  document.querySelectorAll('.btn-difficulty').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.diff === key);
  });
  var descEl = document.getElementById('difficulty-description');
  if (descEl) descEl.textContent = 'All difficulty modes use the same static economy in this version.';
}

/** Reads #seed-input — seeds are not used in static shell */
function startGameWithSeedInput() {
  startGame();
}

/** Replay — starts a fresh game in static shell */
function replayWithSameSeed() {
  startGame();
}

/** Sandbox mode — extends to 24 quarters with static values */
function startSandboxMode() {
  state.totalQuarters = 24;
  var sandboxBanner = document.getElementById('sandbox-banner');
  if (sandboxBanner) sandboxBanner.style.display = '';
  showScreen('screen-game');
  state.quarter += 1;
  state.phase = 'decision';
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
  renderQuarterProgress();
  var endStart = document.getElementById('end-final-rate-start');
  if (endStart) endStart.textContent = 'Started: ' + fmt(STATIC_RATE) + '%';
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
