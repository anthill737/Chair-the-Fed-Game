/* ==========================================================================
   CHAIR THE FED — events.js
   Event system: shock events, routine news briefings, advisor recommendations.

   Exports (globals):
     SHOCK_EVENTS           — array of 15 named economic shock events
     selectEvent(rng, diff) — returns a SHOCK_EVENT or null for the quarter
     ROUTINE_NEWS           — array of 10 quarterly briefing entries (no event)
     getAdvisorRecs(inflation, unemployment, fedRate, difficulty)
                            — returns array of 3 advisor recommendation objects
   ========================================================================== */


/* ==========================================================================
   SHOCK EVENTS
   Each event: { title, headline, body, inflShock, unempShock, severity }
     inflShock  : number — positive = upward pressure on inflation
     unempShock : number — positive = upward pressure on unemployment
     severity   : 'minor' | 'moderate' | 'major'
   ========================================================================== */

var SHOCK_EVENTS = [
  {
    title:     'Oil Price Crash',
    headline:  'Crude Prices Collapse as OPEC Floods the Market',
    body:      '<p>Benchmark crude tumbled more than 25% after OPEC members abandoned output limits, triggering a supply glut. Gasoline prices dropped sharply at the pump, and energy-sector payrolls fell for the second month running.</p>' +
               '<p class="news-context">Cheaper energy pulls headline CPI lower and squeezes margins in oil-producing regions, weighing on employment there.</p>',
    inflShock:  -0.36,
    unempShock:  0.24,
    severity:   'minor'
  },
  {
    title:     'Tech Sector Surge',
    headline:  'Tech Hiring Boom Adds 90,000 Jobs in a Single Quarter',
    body:      '<p>Major technology firms announced record capital spending plans, and venture funding hit a post-pandemic high. The sector added roughly 90,000 jobs last quarter — twice the pace of the broader economy.</p>' +
               '<p class="news-context">Strong tech hiring tightens the labor market and lifts consumer spending without generating significant goods-price inflation.</p>',
    inflShock:   0.12,
    unempShock: -0.36,
    severity:   'minor'
  },
  {
    title:     'Banking Stress',
    headline:  'Regional Bank Failures Spark Credit Crunch Fears',
    body:      '<p>Three mid-sized regional banks failed after losses on commercial real-estate portfolios triggered a deposit run. The Fed\'s Senior Loan Officer Survey showed the steepest tightening of lending standards since the financial crisis.</p>' +
               '<p class="news-context">A credit crunch slows business investment and consumer borrowing, cooling demand and raising unemployment risk.</p>',
    inflShock:  -0.24,
    unempShock:  0.60,
    severity:   'moderate'
  },
  {
    title:     'Trade Policy Shock',
    headline:  'Sweeping Tariffs Hit Imports; Retailers Warn of Price Hikes',
    body:      '<p>The administration imposed broad tariff increases on imports from key trading partners. Major retailers projected price increases of 5–10% on affected goods within two quarters, and manufacturers began reviewing supply-chain shifts.</p>' +
               '<p class="news-context">Tariffs push consumer prices higher while supply-chain uncertainty dampens hiring and business investment.</p>',
    inflShock:   0.48,
    unempShock:  0.36,
    severity:   'moderate'
  },
  {
    title:     'Housing Boom',
    headline:  'Home Prices Surge 8% Year-Over-Year; Construction Hiring Accelerates',
    body:      '<p>Residential property values posted their strongest annual gain in a decade, driven by tight inventory and robust demand. Homebuilder payrolls grew by 35,000 last quarter, and shelter costs — the largest CPI component — ticked higher.</p>' +
               '<p class="news-context">Rising home prices add to shelter inflation and lift consumer wealth, supporting spending and tightening the labor market.</p>',
    inflShock:   0.24,
    unempShock: -0.24,
    severity:   'minor'
  },
  {
    title:     'Wage Pressure Surge',
    headline:  'Average Hourly Earnings Up 4.8% — Fastest Pace in Seven Years',
    body:      '<p>Average hourly earnings rose at their fastest annual rate since the last recovery. Employers in services, healthcare, and logistics reported intense competition for workers, with signing bonuses becoming routine.</p>' +
               '<p class="news-context">Accelerating wages raise household purchasing power and business input costs, feeding through to consumer prices over the following quarters.</p>',
    inflShock:   0.60,
    unempShock: -0.12,
    severity:   'moderate'
  },
  {
    title:     'Supply Chain Disruption',
    headline:  'Port Backlogs Stretch Lead Times; Input Costs Jump',
    body:      '<p>Labor disputes combined with record container volumes created severe congestion at major ports. Import lead times hit all-time highs, and producer prices for intermediate goods rose 1.2% in a single month.</p>' +
               '<p class="news-context">Supply bottlenecks push goods prices higher while slowing output — a combination that pressures both inflation and employment.</p>',
    inflShock:   0.48,
    unempShock:  0.24,
    severity:   'moderate'
  },
  {
    title:     'Strong Jobs Report',
    headline:  'Payrolls Beat Forecasts by 80,000; Unemployment Drops to Cycle Low',
    body:      '<p>The Bureau of Labor Statistics reported 280,000 jobs added last month — well above the consensus estimate. Unemployment fell to its lowest point in the current cycle, and labor force participation rose for the third consecutive month.</p>' +
               '<p class="news-context">A tight labor market boosts consumer confidence and spending, putting mild upward pressure on wages and prices.</p>',
    inflShock:   0.12,
    unempShock: -0.48,
    severity:   'minor'
  },
  {
    title:     'Global Slowdown',
    headline:  'IMF Slashes World Growth Forecast; U.S. Export Orders Slide',
    body:      '<p>The IMF cut its global growth projection by 0.6 percentage points — the second downgrade in a row. U.S. export orders fell sharply as demand from Europe and Asia deteriorated, with manufacturing hit hardest.</p>' +
               '<p class="news-context">Weakening foreign demand reduces U.S. output and hiring while easing commodity-price pressures.</p>',
    inflShock:  -0.36,
    unempShock:  0.48,
    severity:   'moderate'
  },
  {
    title:     'Consumer Confidence Spike',
    headline:  'Consumer Sentiment Hits 15-Year High; Retail Sales Jump 1.4%',
    body:      '<p>The Conference Board Consumer Confidence Index surged to its highest reading in 15 years. Retail sales rose 1.4% in a single month, led by big-ticket durable goods. Households are borrowing more and saving less.</p>' +
               '<p class="news-context">Strong consumer demand tightens the labor market and adds to inflationary pressure across goods and services.</p>',
    inflShock:   0.24,
    unempShock: -0.36,
    severity:   'minor'
  },
  {
    title:     'Credit Tightening',
    headline:  'Banks Pull Back on Lending; Business Investment Plans Cut',
    body:      '<p>The Fed\'s quarterly survey of loan officers showed the sharpest pullback in credit availability in three years. Both consumer and business borrowers faced higher rates and stricter terms, and corporate capital spending plans were revised down.</p>' +
               '<p class="news-context">Tighter credit conditions slow investment and consumption, cooling demand and easing price pressures — but also raising layoff risk.</p>',
    inflShock:  -0.24,
    unempShock:  0.36,
    severity:   'moderate'
  },
  {
    title:     'Energy Price Spike',
    headline:  'Oil Surges 30% on Geopolitical Shock; Gas Prices Hit Decade High',
    body:      '<p>Escalating conflict in a major oil-producing region sent crude prices up 30% in three weeks. Gasoline at the pump hit a decade high, and trucking and airline costs surged, fanning broader price pressures across the economy.</p>' +
               '<p class="news-context">A large energy shock raises headline CPI sharply, squeezes real incomes, and dampens growth — a classic stagflationary impulse.</p>',
    inflShock:   0.84,
    unempShock:  0.24,
    severity:   'major'
  },
  {
    title:     'Dollar Strengthening',
    headline:  'Dollar Index Climbs to 4-Year High; Import Prices Fall',
    body:      '<p>The Dollar Index reached its highest level in four years as safe-haven flows and U.S. rate differentials drove demand. Import prices dropped 1.8% over the quarter, providing a meaningful drag on headline CPI.</p>' +
               '<p class="news-context">A stronger dollar reduces import costs and inflation but puts U.S. exporters at a competitive disadvantage, weighing on manufacturing employment.</p>',
    inflShock:  -0.24,
    unempShock:  0.00,
    severity:   'minor'
  },
  {
    title:     'Manufacturing Decline',
    headline:  'ISM Factory Index Signals Contraction; Layoffs Rise in Industrial States',
    body:      '<p>The ISM Manufacturing Index fell to its lowest level in two years, with new orders, production, and employment sub-indexes all deep in contraction. Industrial companies announced layoffs and deferred planned capital spending.</p>' +
               '<p class="news-context">A manufacturing downturn reduces payrolls in goods-producing sectors and weakens demand, putting downward pressure on prices.</p>',
    inflShock:  -0.12,
    unempShock:  0.48,
    severity:   'moderate'
  },
  {
    title:     'Productivity Boom',
    headline:  'Productivity Surges 3.2% — Best Reading in a Decade; Unit Labor Costs Fall',
    body:      '<p>Non-farm business productivity posted its strongest quarterly gain in ten years, driven by technology adoption and process improvements. Unit labor costs fell for the first time in two years, reducing cost pressures on businesses.</p>' +
               '<p class="news-context">Higher productivity lets businesses expand output without raising prices or cutting staff — a positive supply-side development for the Fed.</p>',
    inflShock:  -0.12,
    unempShock: -0.36,
    severity:   'minor'
  }
];


/* ==========================================================================
   selectEvent(rng, difficulty)
   Returns a SHOCK_EVENT object drawn randomly, or null if no event fires.

   Probability is driven by difficulty.eventFreq:
     textbook  = 0.12  (roughly 1–2 events per 16-quarter game)
     realworld = 0.20  (roughly 3 events per game)
     crisis    = 0.30  (roughly 5 events per game)

   rng — a seeded PRNG function: rng() returns a float in [0, 1)
   difficulty — the current difficulty preset object (must have .eventFreq)
   ========================================================================== */

function selectEvent(rng, difficulty) {
  // Determine event frequency from difficulty preset; default to realworld if missing
  var freq = (difficulty && typeof difficulty.eventFreq === 'number')
    ? difficulty.eventFreq
    : 0.20;

  // Roll to see if any event fires this quarter
  if (rng() >= freq) {
    return null; // No event — most common outcome
  }

  // Pick a random event from the pool
  var idx = Math.floor(rng() * SHOCK_EVENTS.length);
  return SHOCK_EVENTS[idx];
}


/* ==========================================================================
   ROUTINE_NEWS
   Shown when no shock event occurs this quarter.
   Each entry: { badge, headline, body }
     badge    : CSS class string (e.g. 'MARKET UPDATE')
     headline : quarter briefing title
     body     : HTML string with <p> and optional <p class="news-context">
   Rotate through using (quarter - 1) % ROUTINE_NEWS.length.
   ========================================================================== */

var ROUTINE_NEWS = [
  {
    badge:    'LABOR MARKET',
    headline: 'Unemployment Holds at 4.8%; Job Market Steady, In Line with Forecasts',
    body:     '<p>The unemployment rate held at 4.8% last month, matching analyst expectations. Job openings remained elevated and layoffs were subdued, pointing to continued labor-market resilience without clear signs of overheating.</p>' +
              '<p class="news-context">Steady unemployment at this level is consistent with full employment. No material shift in labor-market conditions this quarter.</p>'
  },
  {
    badge:    'INFLATION DATA',
    headline: 'CPI Rises 0.2%; Core Inflation Holds Below Prior Quarter',
    body:     '<p>The Consumer Price Index rose 0.2% last month. Core inflation — stripping out food and energy — came in slightly below the prior quarter\'s pace. Services prices edged up while goods prices were flat.</p>' +
              '<p class="news-context">Inflation is moving in line with the recent trend. No acceleration or deceleration large enough to change the near-term outlook.</p>'
  },
  {
    badge:    'CONSUMER SPENDING',
    headline: 'Retail Sales Up 0.4%; Consumer Confidence Holds Firm',
    body:     '<p>Retail sales rose 0.4% last month, led by autos and online purchases. The Conference Board consumer confidence reading was little changed, suggesting households remain willing to spend despite modest headwinds.</p>' +
              '<p class="news-context">Consumer demand is steady. Spending growth is not accelerating enough to meaningfully add inflationary pressure.</p>'
  },
  {
    badge:    'LABOR MARKET',
    headline: 'Job Openings Dip Modestly; Quit Rate Stays Elevated',
    body:     '<p>Job openings edged down slightly from their recent peak, though total vacancies remain historically high. The quit rate — a sign workers feel confident enough to switch jobs — held firm, suggesting wages should keep rising gradually.</p>' +
              '<p class="news-context">The labor market is cooling at the margins but is not loose. Wage growth is unlikely to slow sharply in the near term.</p>'
  },
  {
    badge:    'GLOBAL ECONOMY',
    headline: 'U.S. Exports Stable; Global Demand Mixed',
    body:     '<p>U.S. goods exports were little changed last quarter as stronger demand from Latin America offset softer orders from Europe. The trade deficit narrowed marginally, and commodity prices were broadly stable.</p>' +
              '<p class="news-context">External conditions are neither a tailwind nor a headwind this quarter. Global dynamics are not changing the domestic inflation or employment picture.</p>'
  },
  {
    badge:    'FINANCIAL CONDITIONS',
    headline: 'Credit Spreads Narrow; Equities Advance Modestly',
    body:     '<p>Investment-grade and high-yield credit spreads narrowed slightly, reflecting improved risk appetite. Equity markets posted modest gains for the quarter, and corporate debt issuance remained healthy at competitive rates.</p>' +
              '<p class="news-context">Financial conditions are supportive without being overly loose. Credit is flowing freely, which is a mild positive for growth.</p>'
  },
  {
    badge:    'WAGES & GROWTH',
    headline: 'Wage Growth Steady at 3.5%; GDP Tracking at 2.1%',
    body:     '<p>Average hourly earnings rose 3.5% year-over-year, in line with recent quarters. Early GDP estimates for the current quarter are tracking near 2.1%, suggesting the economy is expanding at a moderate, sustainable pace.</p>' +
              '<p class="news-context">Wage growth and GDP are both near levels consistent with stable inflation. No sign of overheating or significant slowdown.</p>'
  },
  {
    badge:    'HOUSING & CONSTRUCTION',
    headline: 'Housing Starts Steady; Shelter Inflation Edges Lower',
    body:     '<p>Residential construction starts held near recent levels as mortgage rates stabilized. Shelter costs — the single largest component of core CPI — eased slightly, providing a modest drag on headline inflation.</p>' +
              '<p class="news-context">The cooling in shelter inflation is a positive signal. If it continues, it will put meaningful downward pressure on core CPI over the next several quarters.</p>'
  },
  {
    badge:    'INFLATION DATA',
    headline: 'Producer Prices Flat; Supply Chain Pressures Ease',
    body:     '<p>The Producer Price Index for final demand was unchanged last month, the second consecutive flat reading. Supplier delivery times improved and input cost indices fell across manufacturing surveys, suggesting pipeline inflation pressures are fading.</p>' +
              '<p class="news-context">Easing producer prices typically flow through to consumer prices with a one-to-two quarter lag — a mild disinflationary signal.</p>'
  },
  {
    badge:    'WAGES & LABOR',
    headline: 'Wage Growth Slows to 3.1%, Below Expectations; Hiring Cools',
    body:     '<p>Average hourly earnings rose just 3.1% year-over-year — below the 3.4% consensus forecast. Hiring slowed across several service sectors, and the share of workers voluntarily quitting edged lower, a sign of diminishing worker bargaining power.</p>' +
              '<p class="news-context">Softer wage growth eases cost pressures for businesses and is a mild disinflationary signal, but sustained weakness could weigh on consumer spending.</p>'
  },
  {
    badge:    'CONSUMER SPENDING',
    headline: 'Real Consumer Spending Slows; Saving Rate Ticks Up',
    body:     '<p>Inflation-adjusted consumer spending grew just 0.1% last month as households shifted from spending to saving. The personal saving rate rose to its highest level in three quarters, partly reflecting caution about the economic outlook.</p>' +
              '<p class="news-context">Slowing consumer demand will ease inflationary pressure if sustained, but it also signals weaker growth ahead.</p>'
  },
  {
    badge:    'FINANCIAL CONDITIONS',
    headline: 'Lending Standards Ease Slightly; Business Investment Picks Up',
    body:     '<p>Bank lending standards for commercial and industrial loans eased modestly in the latest quarterly survey. Business investment in equipment and software rose 1.3% — the strongest gain in four quarters — suggesting firms are regaining confidence.</p>' +
              '<p class="news-context">Improving financial conditions and rising investment are mild positives for growth, with some upside risk to labor demand over the coming quarters.</p>'
  }
];


/* ==========================================================================
   getAdvisorRecs(inflation, unemployment, fedRate, difficulty)
   Returns an array of 3 advisor recommendation objects.

   Each advisor: { name, title, avatar, rec, rationale }
     name     : display name string
     title    : role/title string
     avatar   : single character for avatar display (CSS uses data-avatar attr)
     rec      : 'Raise' | 'Lower' | 'Hold'
     rationale: one-sentence directional explanation — no specific rate values

   Signal logic (mandate targets: inflation 2%, unemployment 5%):
     inflSignal  = +1 if inflation > 2.0   (above target → suggests Raise)
                   -1 if inflation < 2.0   (below target → suggests Lower)
                    0 if = 2.0
     unempSignal = +1 if unemployment < 5.0 (labor tight → suggests Raise)
                   -1 if unemployment > 5.0 (labor slack → suggests Lower)
                    0 if = 5.0
     net = inflSignal + unempSignal   (-2 = both Lower, +2 = both Raise, 0 = mixed)

   Both-near-target override: |infl-2| ≤ 0.3 AND |unemp-5| ≤ 0.3 → Hold.

   Advisor personalities (differ in how much net is required before acting):
     Dr. Chen    — hawkish: Raise on net ≥ +1; Lower only on net = -2 (needs both)
     Gov. Rivera — balanced: Raise on net ≥ +1; Lower on net ≤ -1 (symmetric)
     Sec. Park   — dovish:  Lower on net ≤ -1; Raise only on net = +2 (needs both)

   Mixed signal (net = 0, not both near target) → all Hold; signals cancel out.
   ========================================================================== */

// NOTE: As of the current build, app.js implements its own inline advisor logic and does NOT
// call getAdvisorRecs(). This function is currently dead code but is preserved here because
// its hawkish/dovish/balanced logic and rationale strings are the intended implementation.
// Builder 3 may wire this up to replace the inline logic in app.js.
function getAdvisorRecs(inflation, unemployment, fedRate, difficulty) {
  function f1(n) { return n.toFixed(1); }

  // --- Directional signals ---
  // inflSignal:  +1 = inflation above 2% (Raise bias),  -1 = below 2% (Lower bias)
  // unempSignal: +1 = unemployment below 5% (Raise bias), -1 = above 5% (Lower bias)
  var inflSignal  = inflation    > 2.0 ? 1 : (inflation    < 2.0 ? -1 : 0);
  var unempSignal = unemployment < 5.0 ? 1 : (unemployment > 5.0 ? -1 : 0);
  var net = inflSignal + unempSignal;  // ranges: -2, -1, 0, +1, +2

  // Both-near-target: economy in the comfort zone → no urgency to move
  var bothNear = Math.abs(inflation - 2.0) <= 0.3 && Math.abs(unemployment - 5.0) <= 0.3;

  // Dr. Chen: hawkish — Raise on any positive net; Lower only when BOTH signals point down
  function chenRec() {
    if (bothNear)  return 'Hold';
    if (net >= 1)  return 'Raise';
    if (net <= -2) return 'Lower';  // requires both inflation and unemployment to signal Lower
    return 'Hold';
  }

  // Gov. Rivera: balanced — symmetric, acts on net ±1
  function riveraRec() {
    if (bothNear)  return 'Hold';
    if (net >= 1)  return 'Raise';
    if (net <= -1) return 'Lower';
    return 'Hold';
  }

  // Sec. Park: dovish — Lower on any negative net; Raise only when BOTH signals point up
  function parkRec() {
    if (bothNear)  return 'Hold';
    if (net >= 2)  return 'Raise';  // requires both inflation and unemployment to signal Raise
    if (net <= -1) return 'Lower';
    return 'Hold';
  }

  // Magnitude helpers for rationale wording
  function inflWord()  {
    var d = Math.abs(inflation - 2.0);
    if (d < 0.2) return 'slightly';
    if (d < 0.6) return 'moderately';
    return 'significantly';
  }
  function unempWord() {
    var d = Math.abs(unemployment - 5.0);
    if (d < 0.2) return 'slightly';
    if (d < 0.6) return 'moderately';
    return 'significantly';
  }

  // Build rationale strings — conversational, first-person, plain English
  function chenRationale(rec) {
    if (rec === 'Raise') {
      if (inflation > 2.0 && unemployment < 5.0) {
        return 'Inflation at ' + f1(inflation) + '% and the labor market this tight? I\'d raise rates. Waiting only makes the job harder later.';
      }
      if (inflation > 2.0) {
        return 'At ' + f1(inflation) + '%, inflation is running ' + inflWord() + ' above target. I\'d tighten now before price expectations start to drift.';
      }
      return 'Unemployment at ' + f1(unemployment) + '% — the labor market is ' + unempWord() + ' overheated. A rate hike would take some pressure off.';
    }
    if (rec === 'Lower') {
      if (inflation < 2.0 && unemployment > 5.0) {
        return 'Inflation at ' + f1(inflation) + '% and unemployment at ' + f1(unemployment) + '% — both mandates point the same way. Even I\'d cut here.';
      }
      if (unemployment > 5.0) {
        return 'Unemployment at ' + f1(unemployment) + '% is elevated. I\'d support a cut, though I\'ll be watching inflation closely.';
      }
      return 'Inflation at ' + f1(inflation) + '% is below target. Some accommodation makes sense, though I wouldn\'t go far.';
    }
    return 'Inflation ' + f1(inflation) + '%, unemployment ' + f1(unemployment) + '% — we\'re in a good place. Hold the line.';
  }

  function riveraRationale(rec) {
    if (rec === 'Raise') {
      if (inflation > 2.0 && unemployment < 5.0) {
        return 'Inflation at ' + f1(inflation) + '% and unemployment at ' + f1(unemployment) + '% — both sides of the mandate favor a modest raise. Let\'s move.';
      }
      if (inflation > 2.0) {
        return 'Inflation at ' + f1(inflation) + '% is a bit ' + inflWord() + ' above where I\'d like it. A small nudge higher should keep things on track.';
      }
      return 'The labor market is running pretty tight at ' + f1(unemployment) + '%. I\'d lean toward raising before it pushes inflation up further.';
    }
    if (rec === 'Lower') {
      if (inflation < 2.0 && unemployment > 5.0) {
        return 'Inflation at ' + f1(inflation) + '% and unemployment at ' + f1(unemployment) + '% — both mandates are pointing toward easing. Time to cut.';
      }
      if (unemployment > 5.0) {
        return 'Unemployment at ' + f1(unemployment) + '% is higher than I\'d like. Lowering rates would give the labor market some support.';
      }
      return 'Inflation at ' + f1(inflation) + '% is running below the 2% goal. I\'d be comfortable with a small cut here.';
    }
    return 'Inflation ' + f1(inflation) + '%, unemployment ' + f1(unemployment) + '% — pretty close to where we want to be. I\'d hold for now.';
  }

  function parkRationale(rec) {
    if (rec === 'Raise') {
      if (inflation > 2.0 && unemployment < 5.0) {
        return 'Both indicators are pushing toward tightening. Even with my growth focus, I\'d go along with a small raise here.';
      }
      if (inflation > 2.0) {
        return 'Inflation at ' + f1(inflation) + '% is above target. I\'d raise modestly — but I\'d want to stop before it starts hurting job growth.';
      }
      return 'Unemployment at ' + f1(unemployment) + '% is below the natural rate. A small increase wouldn\'t hurt — the labor market can handle it.';
    }
    if (rec === 'Lower') {
      if (inflation < 2.0 && unemployment > 5.0) {
        return 'Unemployment at ' + f1(unemployment) + '% and inflation below target — workers are hurting and prices aren\'t a problem. Cut rates.';
      }
      if (unemployment > 5.0) {
        return 'At ' + f1(unemployment) + '% unemployment, too many people are out of work. Lower rates and get them hired.';
      }
      return 'Inflation at ' + f1(inflation) + '% is below the 2% target. Lower rates would help bring it back up and support growth.';
    }
    return 'Inflation ' + f1(inflation) + '%, unemployment ' + f1(unemployment) + '% — we\'re close enough to target. No need to rock the boat.';
  }

  var chenR    = chenRec();
  var riveraR  = riveraRec();
  var parkR    = parkRec();

  return [
    {
      name:      'Dr. Chen',
      title:     'Chief Economist',
      avatar:    'C',
      rec:       chenR,
      rationale: chenRationale(chenR)
    },
    {
      name:      'Gov. Rivera',
      title:     'Board Governor',
      avatar:    'R',
      rec:       riveraR,
      rationale: riveraRationale(riveraR)
    },
    {
      name:      'Sec. Park',
      title:     'Market Analyst',
      avatar:    'P',
      rec:       parkR,
      rationale: parkRationale(parkR)
    }
  ];
}
