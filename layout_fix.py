"""
Operator layout stabilization fix:
- Fixed panel heights everywhere (state-invariant layout)
- Right column width 280px -> 300px
- Breaking news panel height fixed at 150px
- Decision/result panels same fixed height (258px)
- Advisor panel fixed 120px
- History table: smaller padding, table-layout:fixed, column widths
- news-alert-text clamped to 2 lines
"""

with open('styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

original = css

changes_made = []

def replace(old, new, label):
    global css
    if old in css:
        css = css.replace(old, new)
        changes_made.append(f"OK: {label}")
    else:
        changes_made.append(f"MISS: {label}")

# 1. Right column width 280px -> 300px
replace(
    'grid-template-columns: 230px minmax(0, 1fr) 280px;',
    'grid-template-columns: 230px minmax(0, 1fr) 300px;',
    'right column width 280->300px'
)

# 2. Lock .game-header
replace(
    '  padding: 5px 16px;\n  border-bottom: 3px solid #c8a400;\n  position: relative; /* needed so the dropdown can position itself relative to the header */\n}',
    '  padding: 5px 16px;\n  border-bottom: 3px solid #c8a400;\n  position: relative; /* needed so the dropdown can position itself relative to the header */\n  flex: 0 0 auto;\n  overflow: hidden;\n}',
    'lock game-header flex'
)

# 3. Lock .quarter-progress-panel
replace(
    '  margin: 4px 10px 0;\n  padding: 5px 10px;\n  background: linear-gradient(180deg, #f7f4ee 0%, #ece5d6 100%);\n  border: 1px solid #bbb5a8;\n  box-shadow: 1px 1px 4px rgba(0,0,0,0.08);\n}',
    '  margin: 4px 10px 0;\n  padding: 5px 10px;\n  background: linear-gradient(180deg, #f7f4ee 0%, #ece5d6 100%);\n  border: 1px solid #bbb5a8;\n  box-shadow: 1px 1px 4px rgba(0,0,0,0.08);\n  flex: 0 0 auto;\n  overflow: hidden;\n}',
    'lock quarter-progress-panel flex'
)

# 4. History table: smaller padding
replace(
    '  padding: 6px 10px;\n  text-align: left;\n  font-size: 0.70rem;\n  letter-spacing: 0.10em;\n  text-transform: uppercase;\n  white-space: nowrap;\n}',
    '  padding: 4px 6px;\n  text-align: left;\n  font-size: 0.68rem;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  white-space: nowrap;\n}',
    'history thead th padding'
)

replace(
    '  padding: 5px 10px;\n  color: #2a2a2a;\n  border-bottom: 1px solid #e8e4dc;\n  white-space: nowrap;\n}',
    '  padding: 3px 6px;\n  color: #2a2a2a;\n  border-bottom: 1px solid #e8e4dc;\n  white-space: nowrap;\n}',
    'history tbody td padding'
)

# 5. History table: remove min-width, use table-layout fixed
replace(
    '  width: 100%;\n  border-collapse: collapse;\n  font-size: 0.80rem;\n  font-family: Arial, sans-serif;\n  min-width: 520px;\n}',
    '  width: 100%;\n  border-collapse: collapse;\n  font-size: 0.78rem;\n  font-family: Arial, sans-serif;\n  min-width: 0;\n  table-layout: fixed;\n}',
    'history table min-width and table-layout'
)

# 6. Clamp news-alert-text to 2 lines
replace(
    '.news-alert-text {\n  color: #4a433a;\n  font-size: 0.84rem;\n  line-height: 1.45;\n}',
    '.news-alert-text {\n  color: #4a433a;\n  font-size: 0.84rem;\n  line-height: 1.45;\n  overflow: hidden;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n}',
    'clamp news-alert-text to 2 lines'
)

# 7. Add news-body overflow hidden before the .news-body p rule
replace(
    '.news-body p {\n  font-size: 0.88rem;\n  color: #2a2a2a;\n  line-height: 1.4;\n  margin-bottom: 4px;\n}\n.news-body p:last-child { margin-bottom: 0; }',
    '.news-body {\n  overflow: hidden;\n}\n.news-body p {\n  font-size: 0.88rem;\n  color: #2a2a2a;\n  line-height: 1.4;\n  margin-bottom: 4px;\n}\n.news-body p:last-child { margin-bottom: 0; }',
    'news-body overflow hidden'
)

# 8. Replace the entire viewport-fit layout section with comprehensive fixed layout
old_vp = (
    '/* --- Viewport-fit layout: center column + chart scale to fill available height --- */\n\n'
    '/* Center column: flex column so news and chart share vertical space */\n'
    '.panel-indicators { min-height: 0; overflow: hidden; }\n'
    '.panel-center     { min-height: 0; overflow: hidden; }\n'
    '/* News panel capped so chart always has room to breathe */\n'
    '.panel-news       { flex: 0 0 auto; max-height: 120px; overflow-y: auto; }\n'
    '/* Chart panel grows to fill remaining center-column height */\n'
    '.panel-chart      { flex: 1; min-height: 0; overflow: hidden; }\n'
    '/* Chart frame fills the panel */\n'
    '.chart-frame      { display: flex; flex-direction: column; flex: 1; min-height: 0; }\n'
    '/* Canvas: flex-fill \xe2\x80\x94 grows to consume all remaining chart-frame height */\n'
    '.chart-frame canvas { flex: 1; min-height: 0; height: auto; width: 100%; }\n\n'
    '/* Right column: flex column \xe2\x80\x94 fixed-height slices, history fills remainder */\n'
    '.panel-side { display: flex; flex-direction: column; min-height: 0; overflow: hidden; gap: 8px; }\n'
    '/* Advisor briefing: compact fixed height so it never crowds the policy controls */\n'
    '.panel-side .panel-advisors { flex: 0 0 auto; max-height: 120px; overflow: hidden; }\n'
    '/* Decision / result panels: fixed-size slice (mutually exclusive via .hidden toggle) */\n'
    '.panel-side #panel-decision,\n'
    '.panel-side #panel-result { flex: 0 0 auto; }\n'
    '/* History panel: expands to fill all remaining vertical space */\n'
    '.panel-side .panel-history { flex: 1; min-height: 0; margin: 0; overflow: hidden; }\n'
    '/* History scroll area: fills the panel, scrolls internally */\n'
    '.panel-side .history-scroll { height: 100%; max-height: none; overflow-y: auto; }\n'
    '/* Tighten sidebar panel padding to reclaim vertical space */\n'
    '.panel-side .panel { padding: 10px 12px; }'
)

new_vp = (
    '/* --- FIXED DASHBOARD LAYOUT -------------------------------------------\n'
    '   All heights are deterministic. Content NEVER drives container height.\n'
    '   Layout geometry is identical across all gameplay states.\n'
    '   ----------------------------------------------------------------------- */\n\n'
    '/* Left column: overflow-locked */\n'
    '.panel-indicators { min-height: 0; overflow: hidden; }\n'
    '/* Center column: fixed vertical slices */\n'
    '.panel-center     { min-height: 0; overflow: hidden; }\n\n'
    '/* News/briefing panel: FIXED HEIGHT regardless of content or alert state.\n'
    '   Breaking news uses negative margins to bleed to edges, but the panel\n'
    '   height stays constant so the chart position never shifts between states. */\n'
    '.panel-news {\n'
    '  flex: 0 0 auto;\n'
    '  height: 150px;\n'
    '  overflow: hidden;\n'
    '}\n\n'
    '/* Chart panel grows to fill all remaining center-column height */\n'
    '.panel-chart      { flex: 1; min-height: 0; overflow: hidden; }\n'
    '/* Chart frame fills the panel */\n'
    '.chart-frame      { display: flex; flex-direction: column; flex: 1; min-height: 0; }\n'
    '/* Canvas: flex-fill -- grows to consume all remaining chart-frame height */\n'
    '.chart-frame canvas { flex: 1; min-height: 0; height: auto; width: 100%; }\n\n'
    '/* Right column: flex column, fixed-height slices, history fills remainder */\n'
    '.panel-side { display: flex; flex-direction: column; min-height: 0; overflow: hidden; gap: 8px; }\n\n'
    '/* Advisor briefing: fixed height -- never crowds the policy controls */\n'
    '.panel-side .panel-advisors { flex: 0 0 auto; height: 120px; overflow: hidden; }\n\n'
    '/* Decision + result panels: SAME explicit height (mutually exclusive .hidden swap).\n'
    '   Identical geometry in both states -- layout never shifts when they swap. */\n'
    '.panel-side #panel-decision,\n'
    '.panel-side #panel-result {\n'
    '  flex: 0 0 auto;\n'
    '  height: 258px;\n'
    '  overflow: hidden;\n'
    '}\n\n'
    '/* Rate scroll constrained within decision panel budget */\n'
    '.panel-side .rate-selector-scroll { max-height: 162px; }\n\n'
    '/* History panel: flex-1 fills all remaining vertical space */\n'
    '.panel-side .panel-history { flex: 1; min-height: 0; margin: 0; overflow: hidden; }\n'
    '/* History scroll: fills panel, scrolls internally */\n'
    '.panel-side .history-scroll { height: 100%; max-height: none; overflow-y: auto; }\n'
    '/* Sidebar panel padding */\n'
    '.panel-side .panel { padding: 10px 12px; }\n\n'
    '/* Advisor cards: compact so 2 cards fit in 120px panel */\n'
    '.panel-side .advisor-card { padding: 6px 8px; margin-bottom: 4px; }\n\n'
    '/* History table: fixed column widths for 300px right column (276px usable) */\n'
    '.panel-side .history-table th:nth-child(1),\n'
    '.panel-side .history-table td:nth-child(1) { width: 46px; }\n'
    '.panel-side .history-table th:nth-child(2),\n'
    '.panel-side .history-table td:nth-child(2) { width: 38px; }\n'
    '.panel-side .history-table th:nth-child(3),\n'
    '.panel-side .history-table td:nth-child(3) { width: 46px; }\n'
    '.panel-side .history-table th:nth-child(4),\n'
    '.panel-side .history-table td:nth-child(4) { width: 40px; }\n'
    '.panel-side .history-table th:nth-child(5),\n'
    '.panel-side .history-table td:nth-child(5) { width: 40px; }\n'
    '.panel-side .history-table th:nth-child(6),\n'
    '.panel-side .history-table td:nth-child(6) { width: auto; overflow: hidden; text-overflow: ellipsis; }'
)

if old_vp in css:
    css = css.replace(old_vp, new_vp)
    changes_made.append('OK: replaced viewport-fit section with fixed dashboard layout')
else:
    changes_made.append('MISS: viewport-fit section -- checking alt form')
    # Try to find it
    idx = css.find('.panel-news       { flex: 0 0 auto; max-height: 120px')
    if idx >= 0:
        changes_made.append(f'  Found .panel-news at char {idx}')
        # Show 50 chars before
        changes_made.append(f'  Context: {repr(css[idx-100:idx+150])}')

print('\n'.join(changes_made))

if css != original:
    with open('styles.css', 'w', encoding='utf-8') as f:
        f.write(css)
    lines_changed = sum(1 for a, b in zip(original.split('\n'), css.split('\n')) if a != b)
    print(f'\nWrote styles.css ({lines_changed} lines changed)')
else:
    print('\nWARNING: No changes written')
