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
    headline:  'Global Oil Prices Plunge on Supply Glut',
    body:      '<p>Crude oil inventories have surged as OPEC nations refused to cut production, sending benchmark prices to multi-year lows. Energy costs are falling across the supply chain.</p>' +
               '<p class="news-context">Lower energy prices reduce headline inflation and compress margins for energy-sector employers.</p>',
    inflShock:  -0.3,
    unempShock:  0.2,
    severity:   'minor'
  },
  {
    title:     'Tech Sector Surge',
    headline:  'Technology Investment Boom Drives Hiring Wave',
    body:      '<p>Major technology firms announced record capital expenditure plans, with start-up funding at a cycle high. The sector added jobs at twice the national average pace last quarter.</p>' +
               '<p class="news-context">Strong tech hiring tightens the labor market without adding significant price pressure.</p>',
    inflShock:   0.1,
    unempShock: -0.3,
    severity:   'minor'
  },
  {
    title:     'Banking Stress',
    headline:  'Regional Bank Failures Raise Credit-Market Concerns',
    body:      '<p>Three mid-sized regional banks have failed following losses on commercial real-estate portfolios. Credit spreads widened sharply as lenders tightened standards across the board.</p>' +
               '<p class="news-context">Credit tightening can slow spending and investment, putting downward pressure on inflation while raising unemployment risk.</p>',
    inflShock:  -0.2,
    unempShock:  0.5,
    severity:   'moderate'
  },
  {
    title:     'Trade Policy Shock',
    headline:  'New Tariffs Imposed on Major Trading Partners',
    body:      '<p>The administration announced broad tariff increases on imports from several major trading partners. Retailers and manufacturers warned of significant cost pass-throughs to consumers.</p>' +
               '<p class="news-context">Import tariffs raise consumer prices and disrupt supply chains, increasing both inflation and unemployment risk.</p>',
    inflShock:   0.4,
    unempShock:  0.3,
    severity:   'moderate'
  },
  {
    title:     'Housing Boom',
    headline:  'Home Prices Post Strongest Gain in a Decade',
    body:      '<p>Residential real estate prices accelerated sharply, driven by low inventory and robust demand. Construction activity is picking up, adding jobs in building trades.</p>' +
               '<p class="news-context">A housing boom lifts consumer wealth and construction employment, but also adds upward pressure to shelter inflation.</p>',
    inflShock:   0.2,
    unempShock: -0.2,
    severity:   'minor'
  },
  {
    title:     'Wage Pressure Surge',
    headline:  'Wage Growth Hits Seven-Year High Amid Tight Labor Market',
    body:      '<p>Average hourly earnings jumped 0.5% last month, the sharpest monthly gain since the recovery began. Employers in services, healthcare, and logistics report intense competition for workers.</p>' +
               '<p class="news-context">Rapid wage growth raises household incomes and consumption, but also pushes up business costs and prices.</p>',
    inflShock:   0.5,
    unempShock: -0.1,
    severity:   'moderate'
  },
  {
    title:     'Supply Chain Disruption',
    headline:  'Port Congestion and Freight Delays Squeeze Retailers',
    body:      '<p>A combination of labor disputes and record container volumes has created severe congestion at major ports. Lead times for goods have extended to record lengths, driving up input costs for manufacturers.</p>' +
               '<p class="news-context">Supply bottlenecks raise prices for goods and slow business output, putting pressure on both inflation and employment.</p>',
    inflShock:   0.4,
    unempShock:  0.2,
    severity:   'moderate'
  },
  {
    title:     'Strong Jobs Report',
    headline:  'Payrolls Surge; Unemployment Falls to Cycle Low',
    body:      '<p>The Bureau of Labor Statistics reported far stronger-than-expected job creation last month. Unemployment edged down while labor force participation rose, a rare combination pointing to broad-based hiring.</p>' +
               '<p class="news-context">A robust labor market raises consumer confidence and spending, putting mild upward pressure on wages and prices.</p>',
    inflShock:   0.1,
    unempShock: -0.4,
    severity:   'minor'
  },
  {
    title:     'Global Slowdown',
    headline:  'IMF Cuts World Growth Forecast as Trade Weakens',
    body:      '<p>The International Monetary Fund revised down its global growth outlook for the second consecutive quarter. Export orders fell sharply as demand from key trading partners deteriorated.</p>' +
               '<p class="news-context">A global slowdown reduces demand for U.S. exports, weighing on domestic growth and employment while easing commodity prices.</p>',
    inflShock:  -0.3,
    unempShock:  0.4,
    severity:   'moderate'
  },
  {
    title:     'Consumer Confidence Spike',
    headline:  'Consumer Sentiment Jumps to Post-Crisis High',
    body:      '<p>The Conference Board Consumer Confidence Index surged to its highest reading since the financial crisis. Households reported improved financial conditions and strengthening expectations for jobs and income.</p>' +
               '<p class="news-context">High consumer confidence fuels spending, lifting growth, employment, and mild inflationary pressure.</p>',
    inflShock:   0.2,
    unempShock: -0.3,
    severity:   'minor'
  },
  {
    title:     'Credit Tightening',
    headline:  'Banks Tighten Lending Standards Across Consumer and Business Loans',
    body:      '<p>The Fed\'s Senior Loan Officer Survey showed the sharpest tightening of lending standards in three years. Both consumer and commercial borrowers reported reduced credit availability and higher costs.</p>' +
               '<p class="news-context">Tighter credit restricts investment and consumption, slowing growth and easing price pressures.</p>',
    inflShock:  -0.2,
    unempShock:  0.3,
    severity:   'moderate'
  },
  {
    title:     'Energy Price Spike',
    headline:  'Geopolitical Tensions Send Energy Prices Sharply Higher',
    body:      '<p>Escalating conflict in a major oil-producing region triggered a rapid surge in crude and natural gas prices. Gasoline prices at the pump are up over 20% in three weeks, squeezing household budgets and business costs.</p>' +
               '<p class="news-context">A large energy shock raises headline inflation significantly and dampens growth, risking a stagflationary impulse.</p>',
    inflShock:   0.7,
    unempShock:  0.2,
    severity:   'major'
  },
  {
    title:     'Dollar Strengthening',
    headline:  'U.S. Dollar Reaches Multi-Year High Against Major Currencies',
    body:      '<p>The Dollar Index climbed to its highest level in over four years as safe-haven flows and relative U.S. growth strength drove demand. Import prices fell sharply while U.S. exporters reported increased competitive pressure.</p>' +
               '<p class="news-context">A stronger dollar lowers import prices, reducing inflation, but can weigh on export competitiveness.</p>',
    inflShock:  -0.2,
    unempShock:  0.0,
    severity:   'minor'
  },
  {
    title:     'Manufacturing Decline',
    headline:  'Factory Activity Contracts for Third Straight Month',
    body:      '<p>The ISM Manufacturing Index fell further into contraction territory as new orders, production, and employment sub-indexes all declined. Industrial companies announced layoffs and deferred capital spending.</p>' +
               '<p class="news-context">A manufacturing downturn reduces employment in goods-producing sectors and can pull inflation lower via weaker demand.</p>',
    inflShock:  -0.1,
    unempShock:  0.4,
    severity:   'moderate'
  },
  {
    title:     'Productivity Boom',
    headline:  'Business Productivity Posts Sharpest Quarterly Gain in a Decade',
    body:      '<p>The Bureau of Labor Statistics reported a surge in non-farm business sector productivity, driven by technology adoption and process improvements. Unit labor costs fell for the first time in two years.</p>' +
               '<p class="news-context">Higher productivity enables businesses to raise output without raising prices, putting downward pressure on inflation and supporting employment growth.</p>',
    inflShock:  -0.1,
    unempShock: -0.3,
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
    badge:    'MARKET UPDATE',
    headline: 'Quarterly Economic Briefing',
    body:     '<p>Financial conditions remain broadly stable. Equity markets held near recent levels while credit spreads were little changed. Treasury yields edged up slightly on solid economic data.</p>' +
              '<p class="news-context">No significant shocks this quarter. The economy is evolving according to underlying fundamentals.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Economic Conditions Summary',
    body:     '<p>Consumer spending grew at a moderate pace last quarter, supported by steady job gains and rising household net worth. Business investment was mixed, with services firms outpacing manufacturers.</p>' +
              '<p class="news-context">Domestic demand remains the primary driver of growth. No major external shocks this period.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Labor Market Briefing',
    body:     '<p>Payroll growth was in line with recent trends. Job openings held near cycle highs while quit rates — a proxy for worker confidence — remained elevated. Wage growth was steady but not accelerating.</p>' +
              '<p class="news-context">The labor market is evolving in line with prior-quarter conditions. No unexpected developments to report.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Inflation Monitor',
    body:     '<p>Consumer prices rose at a pace consistent with recent readings. Core goods prices were flat, while services inflation remained slightly elevated. Energy and food costs were stable.</p>' +
              '<p class="news-context">Inflation dynamics are broadly unchanged from last quarter. Monitor for any shifts in services pricing.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Global Conditions Update',
    body:     '<p>International growth was mixed. European activity improved marginally while Asian export data was softer than expected. U.S. trade flows were broadly balanced, with no sharp moves in either direction.</p>' +
              '<p class="news-context">External conditions are neither providing a significant boost nor a material drag on the U.S. economy this quarter.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Credit and Financial Markets',
    body:     '<p>Bank lending standards were unchanged. Household credit quality remained high, and delinquency rates on mortgages and auto loans held near cycle lows. Corporate bond issuance was active at favorable rates.</p>' +
              '<p class="news-context">Financial conditions remain accommodative. No tightening pressures in credit markets this quarter.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Housing and Construction Briefing',
    body:     '<p>Residential construction permits held near recent levels. Existing home sales were steady, supported by low inventory and solid demand. Homebuilder sentiment was stable.</p>' +
              '<p class="news-context">The housing sector continues to contribute modestly to growth without generating outsized inflationary pressure.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Business Conditions Snapshot',
    body:     '<p>Small business optimism edged up in the latest survey, with respondents citing improved sales and hiring intentions. Large-cap earnings reports were broadly in line with expectations.</p>' +
              '<p class="news-context">Business confidence is holding steady. Conditions support continued moderate expansion.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Federal Reserve Monitoring Report',
    body:     '<p>Market expectations for future policy moves were little changed following recent economic data. Longer-term inflation expectations remain anchored near the 2% target, a positive sign for credibility.</p>' +
              '<p class="news-context">The Fed\'s policy stance is being transmitted through financial markets in an orderly fashion this quarter.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Consumer and Household Finance Update',
    body:     '<p>Retail sales grew modestly, led by non-discretionary categories. Household debt-service ratios held near historic lows, suggesting consumers have financial room to absorb modest shocks.</p>' +
              '<p class="news-context">The consumer sector is on solid footing. Spending is growing but not accelerating in a way that would meaningfully change the inflation outlook.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Productivity and Supply-Side Update',
    body:     '<p>Non-farm productivity growth was positive but modest, in line with the post-crisis trend. Unit labor costs increased marginally, consistent with stable underlying inflation pressure.</p>' +
              '<p class="news-context">Supply-side conditions are evolving gradually. No significant productivity surprise this quarter.</p>'
  },
  {
    badge:    'MARKET UPDATE',
    headline: 'Mid-Year Economic Assessment',
    body:     '<p>The economy continues on its current trajectory. Growth is moderate, labor markets are firm, and price pressures are contained. Financial markets are functioning normally with no signs of stress.</p>' +
              '<p class="news-context">A broadly uneventful quarter allows you to focus policy on fine-tuning the path toward your targets.</p>'
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
     rationale: one-sentence explanation mentioning specific numbers

   Advisors have slightly different thresholds to create occasional disagreement:
     Dr. Chen    — hawkish lean (more sensitive to inflation above target)
     Gov. Rivera — balanced / centrist
     Sec. Park   — dovish lean (more sensitive to unemployment above target)

   Thresholds (before advisor-specific adjustments):
     lean Raise if inflation > 2.5 AND unemployment < 6.0
     lean Lower if inflation < 1.5 OR unemployment > 6.5
     otherwise Hold
   ========================================================================== */

function getAdvisorRecs(inflation, unemployment, fedRate, difficulty) {
  // Helper: format a number to one decimal place for rationale strings
  function f1(n) { return n.toFixed(1); }

  // Determine base recommendation for each advisor with slight bias differences
  // Dr. Chen: hawkish — raises threshold for inflation concern, lowers for unemployment
  function chenRec() {
    // Raises if inflation is even mildly above target and labor is not too slack
    if (inflation > 2.3 && unemployment < 6.2) { return 'Raise'; }
    if (inflation < 1.6 || unemployment > 6.3) { return 'Lower'; }
    return 'Hold';
  }

  // Gov. Rivera: balanced — uses the standard thresholds
  function riveraRec() {
    if (inflation > 2.5 && unemployment < 6.0) { return 'Raise'; }
    if (inflation < 1.5 || unemployment > 6.5) { return 'Lower'; }
    return 'Hold';
  }

  // Sec. Park: dovish — more tolerant of inflation, more sensitive to unemployment
  function parkRec() {
    if (inflation > 2.8 && unemployment < 5.8) { return 'Raise'; }
    if (inflation < 1.7 || unemployment > 6.2) { return 'Lower'; }
    return 'Hold';
  }

  // Build rationale strings per advisor and recommendation
  function chenRationale(rec) {
    if (rec === 'Raise') {
      return 'Inflation at ' + f1(inflation) + '% is trending above target and unemployment at ' +
             f1(unemployment) + '% is low enough to absorb tightening.';
    }
    if (rec === 'Lower') {
      return 'With inflation at ' + f1(inflation) + '% and unemployment at ' + f1(unemployment) +
             '%, accommodative policy is warranted to support the mandate.';
    }
    return 'Inflation at ' + f1(inflation) + '% is near the 2% target; current rate of ' +
           f1(fedRate) + '% appears appropriate.';
  }

  function riveraRationale(rec) {
    if (rec === 'Raise') {
      return 'A balanced assessment: inflation of ' + f1(inflation) + '% with unemployment at ' +
             f1(unemployment) + '% argues for modest tightening to prevent overheating.';
    }
    if (rec === 'Lower') {
      return 'The combination of ' + f1(inflation) + '% inflation and ' + f1(unemployment) +
             '% unemployment suggests the economy needs more support.';
    }
    return 'Both mandates look reasonably balanced — inflation ' + f1(inflation) + '%, unemployment ' +
           f1(unemployment) + '%. Holding steady is prudent.';
  }

  function parkRationale(rec) {
    if (rec === 'Raise') {
      return 'Even from a growth-focused perspective, inflation at ' + f1(inflation) +
             '% with unemployment at ' + f1(unemployment) + '% requires attention.';
    }
    if (rec === 'Lower') {
      return 'Unemployment at ' + f1(unemployment) + '% is above where it needs to be — ' +
             'lowering to ' + f1(Math.max(0.25, fedRate - 0.25)) + '% would help.';
    }
    return 'Labor market conditions with ' + f1(unemployment) + '% unemployment look acceptable; ' +
           'no urgency to move rates from ' + f1(fedRate) + '%.';
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
