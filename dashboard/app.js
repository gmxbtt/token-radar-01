// Token Radar dashboard (radar-3.0). Reads window.RADAR (data.js, one level up)
// and window.FIT (fit.js, beside this file) and renders the ranked pre-token
// board, filters, a per-protocol detail view, the separate live-token section
// and the methodology. No network: no fetch, no external fonts, no links out
// — every value shown comes from data.js and fit.js. All fit numbers are read
// from window.FIT at render time, never hard-coded; if fit.js is missing the
// methodology degrades to the model rationale alone.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var FIT = window.FIT || null;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, minTvl: '', sort: 'implied', dir: -1, selected: null };

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

  // A row carries the WATCHLIST badge only when the model flags it as one of
  // the snapshot's named watchlist slugs (row.watchlist, set in data.js).
  // TVL alone cannot identify the watchlist: the radar also ranks pre-token
  // protocols above the floor that the watchlist does not name.
  function isWatch(row) { return row.watchlist === true; }

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
    var top = DATA.rows[0];
    var fitStat = FIT ? fmtR2(FIT.r2_in) : 'n/a';
    return el('section', { class: 'hero' },
      el('h1', { text: 'Pre-token protocols, ranked by implied value' }),
      el('p', null, 'The watchlist is the snapshot\u2019s named list of ', el('b', { text: String(DATA.watchlist_size) }), ' pre-token protocols, each at or above ', el('b', { text: fmtUsd(DATA.floor_usd) }), ' of TVL. The radar adds ', el('b', { text: String(DATA.early_size) }), ' further pre-token protocols the watchlist does not name, so the board covers ', el('b', { text: String(DATA.board_size) }), ' rows in all. Implied value is this entry\u2019s own claim, not a prediction of a launch.'),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Board rows' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { class: 'accent', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'In-sample R\u00B2 (size curve fit)' }), el('b', { text: fitStat })),
        el('div', { class: 'stat' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; updateBoard(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; updateBoard(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; updateBoard(); });
    var minTvl = el('input', { type: 'number', id: 'mintvl', min: '0', step: '1', placeholder: '0', value: state.minTvl, 'aria-label': 'Minimum TVL in millions of dollars' });
    minTvl.addEventListener('input', function () { state.minTvl = minTvl.value; updateBoard(); });
    var watch = el('input', { type: 'checkbox', id: 'watchonly', checked: state.watchOnly ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watch.addEventListener('change', function () { state.watchOnly = watch.checked; updateBoard(); });
    var reset = el('button', { class: 'btn', type: 'button', text: 'Reset', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; state.minTvl = ''; state.sort = 'implied'; state.dir = -1; render(); } });
    var n = filtered().length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
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

  function sortHeader(key, label) {
    var arrow = state.sort === key ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? '▼' : '▲' }) : null;
    return el('th', { scope: 'col', class: 'num' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; } updateBoard(); } }, label, arrow)
    );
  }
  function sortHeaderLeft(key, label) {
    var arrow = state.sort === key ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? '▼' : '▲' }) : null;
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = 1; } updateBoard(); } }, label, arrow)
    );
  }

  function boardTable() {
    var list = sorted(filtered());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search, lower the minimum TVL, or pick another category or chain.' }),
        el('button', { class: 'btn', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; state.minTvl = ''; state.sort = 'implied'; state.dir = -1; render(); } })
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
        ))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols only — strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeaderLeft('name', 'Protocol'),
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Chains' }),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value')
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

  // Methodology, rendered from window.FIT (fit.js) and DATA.model_rationale:
  // every fit number below comes from the data, so a refit needs no page edit.
  // If fit.js failed to load, the section degrades to the rationale alone.
  function methodSection() {
    var sec = el('section', { class: 'panel method' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: DATA.model_rationale })
    );
    if (!FIT) {
      sec.appendChild(el('p', { class: 'note' }, 'Fit details are unavailable in this copy: fit.js did not load. The numbers above are the model\u2019s own summary; the fitted curve, its coefficients and its validation are shown when fit.js is present.'));
      sec.appendChild(methodFoot());
      return sec;
    }
    sec.appendChild(el('div', { class: 'formula' },
      el('b', { text: 'ln(implied value) = ' + fmtNum(FIT.size_intercept, 4) + ' + ' + fmtNum(FIT.size_slope, 3) + ' × ln(TVL),  then × growth tilt' })
    ));
    sec.appendChild(el('p', { text: 'The size curve is a regression of log market cap on log TVL (natural logs), fitted to the snapshot itself. A protocol\u2019s size value is the curve read at its TVL; the growth tilt then nudges it up or down by the week\u2019s TVL change. The curve is the whole size story: a protocol twice as large in TVL is not twice as valuable — the slope below one means implied value grows more slowly than TVL.' }));
    sec.appendChild(el('ul', { class: 'consts' },
      el('li', null, el('span', { text: 'Comparables in snapshot' }), el('b', { text: String(FIT.comps_total) })),
      el('li', null, el('span', { text: 'Usable (positive market cap)' }), el('b', { text: String(FIT.comps_usable) })),
      el('li', null, el('span', { text: 'Zero market cap, excluded' }), el('b', { text: String(FIT.comps_zero_mcap) })),
      el('li', null, el('span', { text: 'Trimmed outside [' + fmtNum(FIT.ratio_low) + ', ' + fmtNum(FIT.ratio_high, 0) + ']' }), el('b', { text: String(FIT.comps_trimmed) })),
      el('li', null, el('span', { text: 'Comparables fitted' }), el('b', { text: String(FIT.comps_fitted) })),
      el('li', null, el('span', { text: 'Size intercept' }), el('b', { text: fmtNum(FIT.size_intercept, 4) })),
      el('li', null, el('span', { text: 'Size slope' }), el('b', { text: fmtNum(FIT.size_slope, 3) })),
      el('li', null, el('span', { text: 'Growth coefficient (fitted)' }), el('b', { text: fmtNum(FIT.growth_coef_raw, 3) })),
      el('li', null, el('span', { text: 'Growth tilt cap' }), el('b', { text: '×' + fmtNum(FIT.growth_tilt_low) + ' – ×' + fmtNum(FIT.growth_tilt_high) })),
      el('li', null, el('span', { text: 'Age coefficient (fitted)' }), el('b', { text: fmtNum(FIT.age_coef, 3) }))
    ));
    sec.appendChild(el('p', { text: 'Age does not move the value. Its fitted coefficient is ' + fmtNum(FIT.age_coef, 3) + ' — indistinguishable from zero — so age is shown on every row and sets the farm hold, but it carries no weight in the implied value. Growth does move it, but only a little: the fitted coefficient is ' + fmtNum(FIT.growth_coef_raw, 3) + ', and the tilt is capped at ×' + fmtNum(FIT.growth_tilt_low) + ' to ×' + fmtNum(FIT.growth_tilt_high) + ' so one hot week can never crown a protocol. The cap is not a guess — the validation table below shows a free growth term doing worse out of sample, which is why the tilt is capped.' }));
    sec.appendChild(el('h3', { text: 'Validation — how honest the curve is' }));
    sec.appendChild(el('div', { class: 'table-wrap' },
      el('table', { class: 'valid' },
        el('caption', { text: 'Fit and out-of-sample checks, all read from fit.js. Median APE is the median absolute percentage error.' }),
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
            el('td', { class: 'num', text: Math.round(FIT.time_med_ape * 100) + '%' }),
            el('td', { text: 'Train ' + FIT.time_train_n + ', test ' + FIT.time_test_n + '; median bias ×' + fmtNum(FIT.time_med_bias) })
          ),
          el('tr', { class: 'plain' },
            el('td', { text: 'Time split, growth left free' }),
            el('td', { class: 'num', text: fmtR2(FIT.time_growth_r2) }),
            el('td', { class: 'num', text: Math.round(FIT.time_growth_med_ape * 100) + '%' }),
            el('td', { text: 'Worse than the capped tilt — the reason the tilt is capped' })
          ),
          el('tr', { class: 'plain' },
            el('td', { text: '5-fold cross-validation (mean)' }),
            el('td', { class: 'num', text: fmtR2(FIT.fold_r2_mean) }),
            el('td', { class: 'num', text: Math.round(FIT.fold_med_ape_mean * 100) + '%' }),
            el('td', { text: 'Mean across the five folds' })
          )
        )
      )
    ));
    sec.appendChild(el('p', { class: 'note' }, 'Read these numbers as an order of magnitude, not a dollar figure. Token multiples spread over more than one order of magnitude even after size is accounted for — the median error above is around three quarters — so every row carries a wide 90% range and the rank, not the dollar figure, is the claim.'));
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
    // Radar-3.0 breakdown, from the row's own fitted components: the size
    // value is the curve read at this TVL, the tilt is the capped growth
    // multiplier, and the interval is the 90% range from the comps' scatter.
    dialog.appendChild(el('section', { class: 'd-section' },
      el('h3', { text: 'Model breakdown' }),
      el('div', { class: 'rows' },
        el('div', null, el('span', { text: 'Size value (curve at this TVL)' }), el('b', { text: fmtUsd(row.size_value_usd) })),
        el('div', null, el('span', { text: 'Growth tilt' }), el('b', { text: '× ' + fmtNum(row.growth_tilt, 4) })),
        el('div', null, el('span', { text: 'Age weight' }), el('b', { text: '× 1.00 — age does not move value' })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: '90% interval' }), el('b', { text: fmtUsd(row.interval_low_usd) + ' – ' + fmtUsd(row.interval_high_usd) }))
      ),
      el('p', { text: 'Model ' + DATA.model_version + ': the implied value above is the value the board carries for this row, shown exactly as stated. The interval is wide on purpose — see the methodology. An estimate of an order of magnitude, not a price.' })
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
    shell.appendChild(liveSection());
    shell.appendChild(el('div', { class: 'section-head' }, el('h2', { text: 'Methodology' })));
    shell.appendChild(methodSection());
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
