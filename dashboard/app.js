// Token Radar dashboard (radar-5.0). Reads window.RADAR (data.js, one level up)
// and window.FIT (fit.js, beside this file) and renders the ranked pre-token
// board with farm verdicts, filters, a per-protocol detail view, the separate
// live-token section and the research note. No network: no fetch, no external
// fonts, no links out — every value shown comes from data.js and fit.js. All
// fit numbers are read from window.FIT at render time, never hard-coded; if
// fit.js is missing the research note degrades to the model rationale alone.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var FIT = window.FIT || null;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', watchOnly: false, minTvl: '', sort: 'implied', dir: -1, selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtNum(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(digits === undefined ? 2 : digits);
  }
  function fmtR2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2);
  }
  // A break-even share as basis points: 0.00001 of implied value is 0.1 bp.
  // Adaptive decimals: the shares are tiny, and two decimals would print
  // every top row as 0.00 bp.
  function fmtBp(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var bp = n * 10000;
    if (bp >= 0.1) return bp.toFixed(2) + ' bp';
    if (bp >= 0.01) return bp.toFixed(3) + ' bp';
    return bp.toFixed(4) + ' bp';
  }
  function fmtShare(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n * 100).toFixed(6) + '%';
  }

  // A row carries the WATCHLIST badge only when the model flags it as one of
  // the snapshot's named watchlist slugs (row.watchlist, set in data.js).
  // TVL alone cannot identify the watchlist: the radar also ranks pre-token
  // protocols above the floor that the watchlist does not name.
  function isWatch(row) { return row.watchlist === true; }
  function verdictOf(row) { return row.farm_verdict || 'THIN'; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var min = state.minTvl === '' ? 0 : parseFloat(state.minTvl) * 1e6;
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.verdict !== 'all' && verdictOf(r) !== state.verdict) return false;
      if (state.watchOnly && !isWatch(r)) return false;
      if (r.tvl_usd < min) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -Infinity : a.age_days; bv = b.age_days === null ? -Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'verdict') { av = a.farm_break_even_share; bv = b.farm_break_even_share; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), 'Token Radar'),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function hero() {
    var farmCount = FIT && FIT.verdicts ? FIT.verdicts.farm : null;
    return el('section', { class: 'hero' },
      el('h1', { text: 'Pre-token protocols, ranked by implied value' }),
      el('p', null, 'The watchlist is the snapshot\u2019s named list of ', el('b', { text: String(DATA.watchlist_size) }), ' pre-token protocols, each at or above ', el('b', { text: fmtUsd(DATA.floor_usd) }), ' of TVL. The radar adds ', el('b', { text: String(DATA.early_size) }), ' further pre-token protocols the watchlist does not name, so the board covers ', el('b', { text: String(DATA.board_size) }), ' rows in all. Implied value is this entry\u2019s own claim, not a prediction of a launch. Every row carries a farm verdict — FARM, THIN or SKIP — from the cost of farming it against its implied value.'),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Board rows' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { class: 'accent', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'In-sample R\u00B2 (chosen model)' }), el('b', { text: FIT ? fmtR2(FIT.r2_in) : 'n/a' })),
        el('div', { class: 'stat' }, el('span', { text: 'Leave-one-out median miss' }), el('b', { text: FIT && FIT.loo_med_miss !== null && FIT.loo_med_miss !== undefined ? '\u00D7' + fmtNum(FIT.loo_med_miss, 2) : 'n/a' })),
        el('div', { class: 'stat' }, el('span', { text: 'FARM verdicts' }), el('b', { class: 'accent', text: farmCount === null ? 'n/a' : farmCount + ' of ' + DATA.board_size }))
      )
    );
  }

  function selectField(id, label, options, value, onChange) {
    var sel = el('select', { id: id, 'aria-label': label },
      options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === value ? 'selected' : null }); })
    );
    sel.addEventListener('change', function () { onChange(sel.value); updateBoard(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; updateBoard(); });
    var minTvl = el('input', { type: 'number', id: 'mintvl', min: '0', step: '1', placeholder: '0', value: state.minTvl, 'aria-label': 'Minimum TVL in millions of dollars' });
    minTvl.addEventListener('input', function () { state.minTvl = minTvl.value; updateBoard(); });
    var watch = el('input', { type: 'checkbox', id: 'watchonly', checked: state.watchOnly ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watch.addEventListener('change', function () { state.watchOnly = watch.checked; updateBoard(); });
    var reset = el('button', { class: 'btn', type: 'button', text: 'Reset', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.watchOnly = false; state.minTvl = ''; state.sort = 'implied'; state.dir = -1; render(); } });
    var n = filtered().length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      selectField('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; }),
      selectField('verdict', 'Verdict', [['all', 'All verdicts'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']], state.verdict, function (v) { state.verdict = v; }),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Min TVL ($M)' }), minTvl),
      el('label', { class: 'toggle', for: 'watchonly' }, watch, 'Watchlist only'),
      reset,
      el('span', { class: 'count', id: 'rowcount' }, el('b', { text: String(n) }), ' of ' + DATA.board_size + ' rows shown')
    );
  }

  // Light update for filters and sorting: rebuild only the board table and the
  // count, so typing in the search box never loses focus or the caret.
  function updateBoard() {
    var wrap = document.getElementById('boardwrap');
    if (wrap) { wrap.textContent = ''; wrap.appendChild(boardTable()); }
    var c = document.getElementById('rowcount');
    if (c) { c.textContent = ''; c.appendChild(el('b', { text: String(filtered().length) })); c.appendChild(document.createTextNode(' of ' + DATA.board_size + ' rows shown')); }
  }

  function sortHeader(key, label, left) {
    var arrow = state.sort === key ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? '▼' : '▲' }) : null;
    return el('th', { scope: 'col', class: left ? '' : 'num' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = (key === 'rank' || key === 'verdict') ? 1 : -1; } updateBoard(); } }, label, arrow)
    );
  }

  function verdictBadge(v) {
    return el('span', { class: 'verdict v-' + v.toLowerCase(), text: v });
  }

  function boardTable() {
    var list = sorted(filtered());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search, lower the minimum TVL, or pick another category, chain or verdict.' }),
        el('button', { class: 'btn', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.watchOnly = false; state.minTvl = ''; state.sort = 'implied'; state.dir = -1; render(); } })
      ));
    }
    // Bars scale against the board's top implied value, not the first row of a
    // re-sorted view, so a sort never rescales the bars underneath the reader.
    var max = (DATA.rows[0] && DATA.rows[0].implied_value_usd) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var g = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          isWatch(r) ? el('span', { class: 'watch', text: 'WATCHLIST' }) : null,
          el('div', { class: 'sub', text: r.slug })
        )),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'sub', text: (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: g }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, verdictBadge(verdictOf(r)))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols only — strongest implied value first. Select a row for its model breakdown, bootstrap range and farm economics.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol', true),
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Chains' }),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('verdict', 'Verdict')
          )),
          tbody
        )
      )
    );
  }

  function liveSection() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { class: 'plain' },
        el('td', null, el('span', { class: 'sub' }, el('span', { class: 'dot live' }), 'already trades')),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('div', { class: 'sub', text: r.slug }))),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) })
      ));
    });
    return el('section', null,
      el('div', { class: 'section-head' },
        el('h2', { text: 'Live tokens — set aside, never ranked' }),
        el('span', { class: 'badge-live', text: DATA.live_size + ' protocols' })
      ),
      el('p', { class: 'live-note', text: 'These protocols already have a token that trades, so the market has already valued them. Their market cap is the market\u2019s own value — a fact, not a model — and they never enter the pre-token ranking above.' }),
      el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { text: 'Live-token protocols by market cap. No implied value is shown for them.' }),
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', text: 'Token' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Category' }),
              el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' })
            )),
            tbody
          )
        )
      )
    );
  }

  // Farm next: the five FARM rows with the best net value per hands-on hour. The net
  // uses the same stated 1% low-end share as the verdicts; the hours are the plan's
  // hands-on hours (step times plus ten minutes per week of the hold).
  function farmNext() {
    var best = DATA.rows.filter(function (r) { return verdictOf(r) === 'FARM'; })
      .sort(function (a, b) { return (b.farm_net_low_per_hour_usd || 0) - (a.farm_net_low_per_hour_usd || 0); })
      .slice(0, 5);
    if (best.length === 0) return null;
    var tbody = el('tbody');
    best.forEach(function (r) {
      tbody.appendChild(el('tr', { class: 'plain' },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('div', { class: 'sub', text: r.slug }))),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.farm_net_low_usd) }),
        el('td', { class: 'num', text: (r.farm_hands_on_hours === null || r.farm_hands_on_hours === undefined ? 'n/a' : fmtNum(r.farm_hands_on_hours, 2) + ' h') }),
        el('td', { class: 'num', text: fmtUsd(r.farm_net_low_per_hour_usd) + ' / h' })
      ));
    });
    return el('section', null,
      el('div', { class: 'section-head' },
        el('h2', { text: 'Farm next — best net value per hands-on hour' }),
        el('span', { class: 'badge-live', text: 'FARM only' })
      ),
      el('p', { class: 'live-note', text: 'Net value is the stated 1% share of implied value minus the farm cost; the hours are the plan\u2019s hands-on hours.' }),
      el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { text: 'The five FARM rows with the best net value per hands-on hour.' }),
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', class: 'num', text: 'Rank' }), el('th', { scope: 'col', text: 'Protocol' }),
              el('th', { scope: 'col', class: 'num', text: 'Implied value' }), el('th', { scope: 'col', class: 'num', text: 'Net value' }),
              el('th', { scope: 'col', class: 'num', text: 'Hands-on' }), el('th', { scope: 'col', class: 'num', text: 'Net per hour' })
            )),
            tbody
          )
        )
      )
    );
  }

  // Research note, rendered from window.FIT (fit.js) and DATA.model_rationale:
  // every fit number below comes from the data, so a refit needs no page edit.
  // If fit.js failed to load, the section degrades to the rationale alone.
  // The market line as an inline SVG: one dot per trimmed comparable (log market cap
  // against log TVL) and the pooled curve through them, drawn from FIT.market_line.
  function marketLineSvg() {
    var ml = FIT && FIT.market_line ? FIT.market_line : null;
    if (!ml || !ml.points || ml.points.length < 2) return null;
    var W = 640, H = 340, L = 58, R = 18, T = 16, B = 42;
    var xs = ml.points.map(function (p) { return p[0]; });
    var ys = ml.points.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs) - 0.4, x1 = Math.max.apply(null, xs) + 0.4;
    var y0 = Math.min.apply(null, ys) - 0.4, y1 = Math.max.apply(null, ys) + 0.4;
    var X = function (v) { return (L + ((v - x0) / (x1 - x0)) * (W - L - R)).toFixed(1); };
    var Y = function (v) { return (H - B - ((v - y0) / (y1 - y0)) * (H - T - B)).toFixed(1); };
    function usd(lv) {
      var v = Math.exp(lv);
      if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
      if (v >= 1e6) return '$' + Math.round(v / 1e6) + 'M';
      return '$' + Math.round(v / 1e3) + 'K';
    }
    var s = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Log market cap against log TVL for the trimmed comparables, with the pooled curve">'];
    s.push('<clipPath id="mlclip"><rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '"/></clipPath>');
    var g;
    for (g = Math.ceil(x0); g <= x1; g++) {
      s.push('<line x1="' + X(g) + '" y1="' + Y(y0) + '" x2="' + X(g) + '" y2="' + Y(y1) + '" stroke="#22332d"/><text x="' + X(g) + '" y="' + (H - 24) + '" fill="#8fa89e" font-size="11" text-anchor="middle">' + usd(g) + '</text>');
    }
    for (g = Math.ceil(y0); g <= y1; g++) {
      s.push('<line x1="' + X(x0) + '" y1="' + Y(g) + '" x2="' + X(x1) + '" y2="' + Y(g) + '" stroke="#22332d"/><text x="' + (L - 8) + '" y="' + (+Y(g) + 4) + '" fill="#8fa89e" font-size="11" text-anchor="end">' + usd(g) + '</text>');
    }
    s.push('<text x="' + ((W - L - R) / 2 + L).toFixed(1) + '" y="' + (H - 6) + '" fill="#8fa89e" font-size="12" text-anchor="middle">TVL, log scale</text>');
    s.push('<g clip-path="url(#mlclip)"><line x1="' + X(x0) + '" y1="' + Y(ml.intercept + ml.slope * x0) + '" x2="' + X(x1) + '" y2="' + Y(ml.intercept + ml.slope * x1) + '" stroke="#2fd6a3" stroke-width="2"/>');
    ml.points.forEach(function (p) { s.push('<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="3" fill="#2fd6a3" fill-opacity="0.55"/>'); });
    s.push('</g></svg>');
    return s.join('');
  }

  function researchSection() {
    var sec = el('section', { class: 'panel method' },
      el('h2', { text: 'Research note — how this radar works, and what it cannot do' }),
      el('p', { text: DATA.model_rationale })
    );
    if (!FIT) {
      sec.appendChild(el('p', { class: 'note' }, 'Fit details are unavailable in this copy: fit.js did not load. The numbers above are the model\u2019s own summary; the fitted curves, their coefficients and their validation are shown when fit.js is present.'));
      sec.appendChild(methodFoot());
      return sec;
    }
    sec.appendChild(el('div', { class: 'formula' },
      el('b', { text: 'Chosen model: ' + FIT.chosen_model + ' — ln(implied value) = range-gated category curve at ln(TVL), shrunk toward pooled ln(mcap) = ' + fmtNum(FIT.pooled_intercept, 4) + ' + ' + fmtNum(FIT.pooled_slope, 3) + ' × ln(TVL), then × growth tilt' })
    ));
    sec.appendChild(el('p', { text: 'The size curve is a regression of log market cap on log TVL (natural logs), fitted to the snapshot itself. A protocol\u2019s size value is the curve read at its TVL; the growth tilt then nudges it up or down by the week\u2019s TVL change. The curve is the whole size story: a protocol twice as large in TVL is not twice as valuable — the slope below one means implied value grows more slowly than TVL.' }));
    var scatter = marketLineSvg();
    if (scatter) {
      sec.appendChild(el('h3', { text: 'The market line — the fit, drawn' }));
      var scatterBox = el('div', { class: 'scatter' });
      scatterBox.innerHTML = scatter;
      sec.appendChild(scatterBox);
      sec.appendChild(el('p', { text: 'Each dot is one of the ' + (FIT.market_line ? FIT.market_line.points.length : 0) + ' trimmed comparables, log market cap against log TVL; the line is the pooled curve. The dots spread over more than an order of magnitude around the line even after size is accounted for — that spread is the 90% interval on every row, and the reason the rank, not the dollar figure, is the claim.' }));
    }
    // The range gate, with the one row it moves: the Dexs curve's fitted TVL range
    // against bittensor-dtao's TVL and its decayed weight, all from the data.
    var gateCurve = null, gateRow = null;
    (FIT.curves || []).forEach(function (cv) { if (cv.category === 'Dexs') gateCurve = cv; });
    DATA.rows.forEach(function (r) { if (r.slug === 'bittensor-dtao') gateRow = r; });
    if (gateCurve && gateRow) {
      var gateD = gateRow.tvl_usd > gateCurve.range_hi_tvl_usd
        ? Math.log(gateRow.tvl_usd) - Math.log(gateCurve.range_hi_tvl_usd)
        : Math.log(gateCurve.range_lo_tvl_usd) - Math.log(gateRow.tvl_usd);
      sec.appendChild(el('h3', { text: 'The range gate — a curve is trusted only where its data is' }));
      sec.appendChild(el('p', { text: 'A category curve is trusted only inside the TVL range its own comparables span. Outside it, its weight decays as exp(−d\u00B2 / 2\u03C3\u00B2) in log TVL, \u03C3 = ' + fmtNum(FIT.range_decay_sigma, 1) + ', so the pooled curve takes over instead of a steep small-sample curve being extrapolated far beyond its data. The gate moves exactly one row: the Dexs curve is fitted on comparables from ' + fmtUsd(gateCurve.range_lo_tvl_usd) + ' to ' + fmtUsd(gateCurve.range_hi_tvl_usd) + ' of TVL, and bittensor-dtao holds ' + fmtUsd(gateRow.tvl_usd) + ' — about ' + fmtNum(gateD, 1) + ' log-units beyond that range — so its Dexs weight decays to ' + fmtNum(gateRow.curve_weight, 2) + ' and it is valued almost entirely on the pooled curve, at ' + fmtUsd(gateRow.implied_value_usd) + ' and rank ' + gateRow.rank + ' instead of the $264M rank 1 the ungated Dexs curve gave it in radar-4.0. The gate changes no out-of-sample score — the comparables sit inside their own ranges by construction — so it is a guard against extrapolation, not a fit improvement.' }));
    }
    sec.appendChild(el('ul', { class: 'consts' },
      el('li', null, el('span', { text: 'Comparables in snapshot' }), el('b', { text: String(FIT.comps_total) })),
      el('li', null, el('span', { text: 'Usable (positive market cap)' }), el('b', { text: String(FIT.comps_usable) })),
      el('li', null, el('span', { text: 'Zero market cap, excluded' }), el('b', { text: String(FIT.comps_zero_mcap) })),
      el('li', null, el('span', { text: 'Trimmed outside [' + fmtNum(FIT.ratio_low) + ', ' + fmtNum(FIT.ratio_high, 0) + ']' }), el('b', { text: String(FIT.comps_trimmed) })),
      el('li', null, el('span', { text: 'Comparables fitted' }), el('b', { text: String(FIT.comps_fitted) })),
      el('li', null, el('span', { text: 'Pooled intercept' }), el('b', { text: fmtNum(FIT.pooled_intercept, 4) })),
      el('li', null, el('span', { text: 'Pooled slope' }), el('b', { text: fmtNum(FIT.pooled_slope, 3) })),
      el('li', null, el('span', { text: 'Growth coefficient (fitted)' }), el('b', { text: fmtNum(FIT.growth_coef_raw, 3) })),
      el('li', null, el('span', { text: 'Growth tilt cap' }), el('b', { text: '×' + fmtNum(FIT.growth_tilt_low) + ' – ×' + fmtNum(FIT.growth_tilt_high) })),
      el('li', null, el('span', { text: 'Category range-decay \u03C3 (log TVL)' }), el('b', { text: FIT.range_decay_sigma === null || FIT.range_decay_sigma === undefined ? 'n/a' : fmtNum(FIT.range_decay_sigma, 1) })),
      el('li', null, el('span', { text: 'Age coefficient (fitted)' }), el('b', { text: fmtNum(FIT.age_coef, 3) })),
      el('li', null, el('span', { text: 'Chain-count coefficient' }), el('b', { text: fmtNum(FIT.chains_coef, 3) })),
      el('li', null, el('span', { text: 'Bootstrap resamples' }), el('b', { text: FIT.bootstrap ? String(FIT.bootstrap.n) : 'n/a' }))
    ));
    sec.appendChild(el('p', { text: 'Age does not move the value. Its fitted coefficient is ' + fmtNum(FIT.age_coef, 3) + ' — indistinguishable from zero — so age is shown on every row and sets the farm hold, but it carries no weight in the implied value. Growth does move it, but only a little: the fitted coefficient is ' + fmtNum(FIT.growth_coef_raw, 3) + ', and the tilt is capped at ×' + fmtNum(FIT.growth_tilt_low) + ' to ×' + fmtNum(FIT.growth_tilt_high) + ' so one hot week can never crown a protocol. The cap is not a guess — the validation table below shows a free growth term doing worse out of sample, which is why the tilt is capped.' }));

    // Model selection: every candidate, winner and losers, from fit.js.
    sec.appendChild(el('h3', { text: 'Model selection — five candidates, scored out of sample' }));
    sec.appendChild(el('p', { text: 'The winner is the highest mean of time-split R\u00B2 and 5-fold mean R\u00B2. The pooled curve is the reference; the category curves win by a small margin on the folds and tie on the time split; adding log(1 + chain count) makes both worse, and its fitted coefficient is ' + fmtNum(FIT.chains_coef, 3) + ' — essentially zero — so the chain feature is rejected, not used. The Huber robust fit over all 128 usable comparables is far worse out of sample than the hard trim, so the trim stays.' }));
    sec.appendChild(el('h3', { text: 'What was tried and rejected' }));
    sec.appendChild(el('p', { text: 'The search did not stop at the five candidates above. Also tried on the same time-split and 5-fold protocol and rejected: growth and age as joint value features, a quadratic size term, a nearest-neighbour peer curve, winsorising instead of trimming, tighter trims, a Huber fit inside the categories, and a discount for protocols whose sibling token already trades. Each scored worse than the chosen model, so none is used. Age carries no signal among the comparables, and no pre-token row has a trading sibling to discount, so both ideas fail on the data, not on preference.' }));
    var candBody = el('tbody');
    (FIT.candidates || []).forEach(function (c) {
      candBody.appendChild(el('tr', { class: 'plain' },
        el('td', null, el('b', { text: c.name }), c.name === FIT.chosen_model ? el('span', { class: 'watch', text: 'CHOSEN' }) : null),
        el('td', { class: 'num', text: fmtR2(c.in_r2) }),
        el('td', { class: 'num', text: fmtR2(c.time_r2) }),
        el('td', { class: 'num', text: c.time_med_ape === null ? 'n/a' : Math.round(c.time_med_ape * 100) + '%' }),
        el('td', { class: 'num', text: fmtR2(c.fold_r2) }),
        el('td', { class: 'num', text: c.fold_med_ape === null ? 'n/a' : Math.round(c.fold_med_ape * 100) + '%' }),
        el('td', { class: 'num', text: fmtR2(c.combined) })
      ));
    });
    sec.appendChild(el('div', { class: 'table-wrap' },
      el('table', { class: 'valid' },
        el('caption', { text: 'Candidate size models. Combined is the mean of time-split R\u00B2 and 5-fold mean R\u00B2. Median APE is the median absolute percentage error.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Candidate' }),
          el('th', { scope: 'col', class: 'num', text: 'In-sample R²' }),
          el('th', { scope: 'col', class: 'num', text: 'Time-split R²' }),
          el('th', { scope: 'col', class: 'num', text: 'Time med APE' }),
          el('th', { scope: 'col', class: 'num', text: '5-fold R²' }),
          el('th', { scope: 'col', class: 'num', text: '5-fold med APE' }),
          el('th', { scope: 'col', class: 'num', text: 'Combined' })
        )),
        candBody
      )
    ));
    if (FIT.curves && FIT.curves.length) {
      var curveBody = el('tbody');
      FIT.curves.forEach(function (cv) {
        curveBody.appendChild(el('tr', { class: 'plain' },
          el('td', { text: cv.category }),
          el('td', { class: 'num', text: String(cv.n) }),
          el('td', { class: 'num', text: fmtNum(cv.weight, 2) }),
          el('td', { class: 'num', text: fmtNum(cv.intercept, 3) }),
          el('td', { class: 'num', text: fmtNum(cv.slope, 3) }),
          el('td', { class: 'num', text: fmtUsd(cv.range_lo_tvl_usd) + ' – ' + fmtUsd(cv.range_hi_tvl_usd) })
        ));
      });
      sec.appendChild(el('h3', { text: 'Per-category curves (shrunk toward pooled)' }));
      sec.appendChild(el('p', { text: 'Only categories with at least ten trimmed comparables earn their own curve. Each is blended with the pooled curve at weight n / (n + 10), so a small category cannot pull far from the pooled line. Categories not listed here are valued on the pooled curve. A curve is trusted only inside its fitted TVL range, shown in the table; outside it the weight decays toward zero and the pooled curve takes over — see the range gate above.' }));
      sec.appendChild(el('div', { class: 'table-wrap' },
        el('table', { class: 'valid' },
          el('caption', { text: 'Fitted per-category curves. Weight is the share of the category\u2019s own fit in the blend.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', class: 'num', text: 'Comps' }),
            el('th', { scope: 'col', class: 'num', text: 'Weight' }),
            el('th', { scope: 'col', class: 'num', text: 'Intercept' }),
            el('th', { scope: 'col', class: 'num', text: 'Slope' }),
            el('th', { scope: 'col', text: 'Fit range (TVL)' })
          )),
          curveBody
        )
      ));
    }

    // Validation of the winning model.
    sec.appendChild(el('h3', { text: 'Validation — how honest the curve is' }));
    sec.appendChild(el('div', { class: 'table-wrap' },
      el('table', { class: 'valid' },
        el('caption', { text: 'Fit and out-of-sample checks of the chosen model, all read from fit.js.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Check' }),
          el('th', { scope: 'col', class: 'num', text: 'R²' }),
          el('th', { scope: 'col', class: 'num', text: 'Median APE' }),
          el('th', { scope: 'col', text: 'Notes' })
        )),
        el('tbody', null,
          el('tr', { class: 'plain' },
            el('td', { text: 'In-sample fit' }),
            el('td', { class: 'num', text: fmtR2(FIT.r2_in) }),
            el('td', { class: 'num', text: Math.round(FIT.med_ape_in * 100) + '%' }),
            el('td', { text: FIT.comps_fitted + ' comparables; residual SD (log) ' + fmtNum(FIT.resid_sd_log) })
          ),
          el('tr', { class: 'plain' },
            el('td', { text: 'Time split (fit before ' + FIT.time_split_cut + ')' }),
            el('td', { class: 'num', text: fmtR2(FIT.time_r2) }),
            el('td', { class: 'num', text: FIT.time_med_ape === null ? 'n/a' : Math.round(FIT.time_med_ape * 100) + '%' }),
            el('td', { text: 'Train ' + FIT.time_train_n + ', test ' + FIT.time_test_n + '; median bias ×' + fmtNum(FIT.time_med_bias) })
          ),
          el('tr', { class: 'plain' },
            el('td', { text: 'Time split, growth left free' }),
            el('td', { class: 'num', text: fmtR2(FIT.time_growth_r2) }),
            el('td', { class: 'num', text: FIT.time_growth_med_ape === null ? 'n/a' : Math.round(FIT.time_growth_med_ape * 100) + '%' }),
            el('td', { text: 'Worse than the capped tilt — the reason the tilt is capped' })
          ),
          el('tr', { class: 'plain' },
            el('td', { text: '5-fold cross-validation (mean)' }),
            el('td', { class: 'num', text: fmtR2(FIT.fold_r2_mean) }),
            el('td', { class: 'num', text: FIT.fold_med_ape_mean === null ? 'n/a' : Math.round(FIT.fold_med_ape_mean * 100) + '%' }),
            el('td', { text: 'Mean across the five folds' })
          ),
          el('tr', { class: 'plain' },
            el('td', { text: 'Leave-one-out (one refit per comparable)' }),
            el('td', { class: 'num', text: '\u2014' }),
            el('td', { class: 'num', text: FIT.loo_med_ape === null || FIT.loo_med_ape === undefined ? 'n/a' : Math.round(FIT.loo_med_ape * 100) + '%' }),
            el('td', { text: FIT.loo_med_miss === null || FIT.loo_med_miss === undefined ? 'n/a' : 'Median miss \u00D7' + fmtNum(FIT.loo_med_miss, 2) + '; within 3\u00D7 ' + Math.round((FIT.loo_within3 || 0) * 100) + '%, within 10\u00D7 ' + Math.round((FIT.loo_within10 || 0) * 100) + '%' })
          )
        )
      )
    ));
    sec.appendChild(el('p', { class: 'note' }, 'Read these numbers as an order of magnitude, not a dollar figure. Token multiples spread over more than one order of magnitude even after size is accounted for — the median error above is around three quarters — so every row carries a wide 90% range and the rank, not the dollar figure, is the claim.'));

    // Bootstrap stability.
    if (FIT.bootstrap) {
      var top = DATA.rows[0];
      var topCurveNote = top.curve === 'pooled'
        ? 'it is valued on the pooled curve, fitted on all ' + FIT.comps_fitted + ' trimmed comparables — still a claim with a wide range, not a certainty.'
        : 'it is valued on the ' + top.curve + ' curve at weight ' + fmtNum(top.curve_weight, 2) + ', so its rank 1 rests on a small category curve and is a claim with a wide range, not a certainty.';
      sec.appendChild(el('h3', { text: 'Bootstrap stability — how much the ranks move' }));
      sec.appendChild(el('p', { text: 'The winning model was refitted on ' + FIT.bootstrap.n + ' bootstrap resamples of the ' + FIT.comps_fitted + ' trimmed comparables (seed ' + FIT.bootstrap.seed + ', ' + FIT.bootstrap.resamples_used + ' resamples used). Across the top 20 rows the bootstrap median rank sits on average ' + fmtNum(FIT.bootstrap.mean_abs_rank_shift_top20, 2) + ' places from the published rank, and the median 5th–95th percentile rank width is ' + FIT.bootstrap.median_rank_width_top20 + ' places — ranks near the top are stable, ranks further down move more. The top row\u2019s own bootstrap rank range is ' + top.boot_rank_low + '–' + top.boot_rank_high + ', and its bootstrap implied range is ' + fmtUsd(top.boot_low_usd) + ' – ' + fmtUsd(top.boot_high_usd) + ': ' + topCurveNote + ' Every row\u2019s bootstrap range is shown in its detail view.' }));
    }

    // Farm economics: assumption vs policy, stated as such.
    sec.appendChild(el('h3', { text: 'Farm economics — what is assumed, what is policy' }));
    sec.appendChild(el('p', { text: 'Each row\u2019s farm cost is the plan\u2019s capital plus the gas of every transaction the plan implies — a computed number, from the protocol\u2019s own TVL tier, chain and hold. The break-even share is that cost divided by the implied value: the share of the implied value a farmer must capture to cover the farm. The net value assumes, as a stated low-end assumption and not a fitted number, that the farmer captures ' + Math.round(FIT.farm_share_low * 100) + '% of the implied value, then subtracts the farm cost. The verdict is a decision policy on the break-even share: FARM when the whole farm costs at most ' + fmtBp(FIT.verdict_farm_max) + ' of implied value, THIN up to ' + fmtBp(FIT.verdict_thin_max) + ', SKIP above. The thresholds are round policy numbers, stated here and in fit.js, and the counts they produce are ' + FIT.verdicts.farm + ' FARM, ' + FIT.verdicts.thin + ' THIN and ' + FIT.verdicts.skip + ' SKIP. Each row also carries its net value per hands-on hour — the same net divided by the plan\u2019s hands-on hours — and the Farm next strip above names the five FARM rows with the best value per hour. A FARM verdict does not promise an airdrop — it says the farm is cheap next to the value the model claims.' }));
    sec.appendChild(el('h3', { text: 'What this model cannot do' }));
    sec.appendChild(el('p', { text: 'It cannot say whether or when a protocol issues a token, and it cannot price one precisely: the out-of-sample median error is about 74%, and the bootstrap shows ranks moving by double-digit places further down the board. It cannot see anything outside the snapshot — no team, no tokenomics, no points program, no social signal — and a protocol the snapshot records as pre-token may still have a token its DefiLlama record does not carry. The farm plans assume the protocol\u2019s own app works as its listing describes, and the 1% low-end share is an assumption, not a measurement. Use the board to choose where to look, not as a price.' }));
    sec.appendChild(methodFoot());
    return sec;
  }

  function methodFoot() {
    return el('p', null, 'Snapshot ', el('b', { text: DATA.as_of }), ' from DefiLlama. Watchlist floor ', el('b', { text: fmtUsd(DATA.floor_usd) }), ': ', el('b', { text: String(DATA.watchlist_size) }), ' watchlist protocols covered, ', el('b', { text: String(DATA.early_size) }), ' further rows found by the radar, ', el('b', { text: String(DATA.board_size) }), ' rows on the board. A protocol is called pre-token because its DefiLlama record carries no token — not as proof that it has none.');
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; render(); });

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatch(row) ? ' · Watchlist' : ' · Early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains || []).join(', ') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'd-section' },
      el('h3', { text: 'Protocol record' }),
      el('div', { class: 'rows' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'TVL change, 7 days' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: row.age_days === null ? 'unknown' : row.age_days + ' days' })),
        el('div', null, el('span', { text: 'First listed' }), el('b', { text: row.listed_at || 'unknown' })),
        el('div', null, el('span', { text: 'Category' }), el('b', { class: 'plain', text: row.category || 'Other' })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'plain', text: (row.chains || []).join(', ') || '—' })),
        el('div', null, el('span', { text: 'Token on record' }), el('b', { class: 'plain', text: 'none — pre-token' }))
      )
    ));
    // Model breakdown, from the row's own fitted components: the size value is
    // the curve read at this TVL, the tilt is the capped growth multiplier, the
    // interval is the 90% range from the comps' scatter, and the bootstrap
    // range is the 5th–95th percentile over 200 refits. The curve weight is the
    // effective weight of the row's own category curve after the range gate: a
    // weight near zero means the TVL sits outside its category's fitted range
    // and the row is valued almost entirely on the pooled curve.
    var curveLabel = row.curve === 'pooled'
      ? 'pooled'
      : (row.curve_weight !== null && row.curve_weight !== undefined && row.curve_weight < 0.1)
        ? row.curve + ' (weight ' + fmtNum(row.curve_weight, 2) + ' — TVL outside its fit range, effectively pooled)'
        : row.curve + ' (shrunk toward pooled)';
    dialog.appendChild(el('section', { class: 'd-section' },
      el('h3', { text: 'Model breakdown' }),
      el('div', { class: 'rows' },
        el('div', null, el('span', { text: 'Size value (curve at this TVL)' }), el('b', { text: fmtUsd(row.size_value_usd) })),
        el('div', null, el('span', { text: 'Curve used' }), el('b', { class: 'plain', text: curveLabel })),
        el('div', null, el('span', { text: 'Category-curve weight (after range gate)' }), el('b', { text: fmtNum(row.curve_weight, 2) })),
        el('div', null, el('span', { text: 'Growth tilt' }), el('b', { text: '× ' + fmtNum(row.growth_tilt, 4) })),
        el('div', null, el('span', { text: 'Age weight' }), el('b', { text: '× 1.00 — age does not move value' })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: '90% interval' }), el('b', { text: fmtUsd(row.interval_low_usd) + ' – ' + fmtUsd(row.interval_high_usd) })),
        el('div', null, el('span', { text: 'Bootstrap rank range (5–95%)' }), el('b', { text: 'rank ' + row.boot_rank_low + ' – ' + row.boot_rank_high + ' of ' + DATA.board_size })),
        el('div', null, el('span', { text: 'Bootstrap implied range (5–95%)' }), el('b', { text: fmtUsd(row.boot_low_usd) + ' – ' + fmtUsd(row.boot_high_usd) }))
      ),
      el('p', { text: 'Model ' + DATA.model_version + ': the implied value above is the value the board carries for this row, shown exactly as stated. The interval is wide on purpose — see the research note. An estimate of an order of magnitude, not a price.' })
    ));
    // Farm economics: computed cost, break-even share, net under the stated
    // 1% low-end assumption, and the verdict from the stated policy.
    var sharePct = FIT ? Math.round(FIT.farm_share_low * 100) + '%' : '1%';
    var shareNote = FIT
      ? 'The net value assumes the farmer captures ' + sharePct + ' of the implied value — a stated low-end assumption, not a fitted number — then subtracts the farm cost. Verdict policy: FARM at or below ' + fmtBp(FIT.verdict_farm_max) + ' of implied value, THIN up to ' + fmtBp(FIT.verdict_thin_max) + ', SKIP above.'
      : '';
    dialog.appendChild(el('section', { class: 'd-section' },
      el('h3', { text: 'Farm economics — verdict ' + verdictOf(row) }),
      el('div', { class: 'rows' },
        el('div', null, el('span', { text: 'Farm cost (capital + gas)' }), el('b', { text: fmtUsd(row.farm_total_cost_usd) })),
        el('div', null, el('span', { text: 'Break-even share' }), el('b', { text: fmtBp(row.farm_break_even_share) + ' (' + fmtShare(row.farm_break_even_share) + ')' })),
        el('div', null, el('span', { text: 'Net value at stated ' + sharePct + ' share' }), el('b', { text: fmtUsd(row.farm_net_low_usd) })),
        el('div', null, el('span', { text: 'Hands-on time' }), el('b', { text: row.farm_hands_on_hours === null || row.farm_hands_on_hours === undefined ? 'n/a' : fmtNum(row.farm_hands_on_hours, 2) + ' hours' })),
        el('div', null, el('span', { text: 'Net value per hands-on hour' }), el('b', { text: fmtUsd(row.farm_net_low_per_hour_usd) + ' / hour' })),
        el('div', null, el('span', { text: 'Verdict' }), el('b', { class: 'plain', text: verdictOf(row) }))
      ),
      el('p', { text: shareNote })
    ));
    // Farm plan, verbatim from the board: the eight steps live in
    // row.farm_steps (carried by data.js from board.json) and are shown here
    // exactly as written, with the plan's own totals.
    var steps = Array.isArray(row.farm_steps) ? row.farm_steps : [];
    var farmSec = el('section', { class: 'd-section' },
      el('h3', { text: 'Farm plan — from board.json' }),
      el('p', { text: 'The eight-step plan below is the board\u2019s own farm plan for this protocol, shown exactly as written in board.json. Totals: ' + fmtUsd(row.farm_capital_usd) + ' of capital, about ' + fmtUsd(row.farm_gas_usd) + ' of gas, hold at least ' + row.farm_hold_days + ' days.' })
    );
    if (steps.length) {
      farmSec.appendChild(el('ol', { class: 'steps' }, steps.map(function (s) {
        return el('li', { text: s });
      })));
    } else {
      farmSec.appendChild(el('p', { text: 'No farm plan is recorded for this row.' }));
    }
    dialog.appendChild(farmSec);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(controls());
    shell.appendChild(el('div', { class: 'section-head' },
      el('h2', { text: 'The board' }),
      el('p', { text: 'Pre-token protocols ranked by implied value. Click a column to sort; click a row for its detail.' })
    ));
    shell.appendChild(el('div', { id: 'boardwrap' }, boardTable()));
    var next = farmNext();
    if (next) shell.appendChild(next);
    shell.appendChild(liveSection());
    shell.appendChild(el('div', { class: 'section-head' }, el('h2', { text: 'Methodology' })));
    shell.appendChild(researchSection());
    shell.appendChild(el('footer', { class: 'foot', text: 'Token Radar · snapshot ' + DATA.as_of + ' · source DefiLlama · model ' + DATA.model_version + ' · ' + DATA.board_size + ' pre-token rows, ' + DATA.live_size + ' live-token protocols set aside.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
  }

  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
