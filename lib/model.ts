// The token radar's model, radar-5: one snapshot of the protocol universe in, one ranked board out.
//
// radar-5 keeps radar-4's shape — a size curve fitted to the snapshot's own comparables, a capped
// growth tilt, an honest out-of-sample report — and adds the three things radar-4 lacked:
//
//   1. Range-gated category curves. A category curve is now trusted only inside the TVL range its
//      own comparables span: outside that range its weight decays toward zero (a Gaussian decay in
//      log TVL, sigma 0.7), so the pooled curve takes over instead of a steep small-sample curve
//      being extrapolated far beyond its data. The gate changes no out-of-sample score — the
//      comparables sit inside their own ranges by construction — and it moves exactly one board row:
//      bittensor-dtao, whose $376M TVL sits 1.9 log-units beyond the Dexs comparables' $7–56M range,
//      falls from rank 1 ($264M on the extrapolated Dexs curve) to rank 8 ($46M on the pooled
//      curve). The gate is a guard against extrapolation, not a fit improvement, and the research
//      note says so with the numbers.
//   2. Leave-one-out validation. The winning model is refitted once per trimmed comparable held
//      out, and the held-out error is reported as a median miss multiple and the share within 3x
//      and 10x — the same language the strongest dashboards use, computed here rather than claimed.
//   3. Farm value per hands-on hour. Every farm plan already states its step times; the plan's
//      hands-on minutes are now totalled (step times plus ten minutes per week of the hold), and each
//      row carries its net value per hands-on hour, so the board can name the best farm per hour of
//      work, not only the biggest implied value.
//
// What is fitted, what is assumed and what is policy are kept apart throughout, and the dashboard's
// research note says which is which. Nothing about the value model is a number somebody typed in,
// except the shrinkage constant (10), the range-decay sigma (0.7), the bootstrap count and seed, the
// 1% low-end share, and the verdict thresholds — all five are disclosed in fit.js and on the page.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and ranks
// every other rankable pre-token protocol too. A protocol is pre-token when its record carries no
// token (no market cap, no CoinGecko id, no symbol); live-token protocols are kept apart and shown
// as the market's own values, never mixed into the ranked board.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-5.0';

/** The value model in plain words, for the dashboard to show next to the formula. No fitted number
 *  is written here: the numbers live in fit.js, which the page reads at render time. */
export const MODEL_RATIONALE =
  'Implied value comes from a size curve fitted to the snapshot itself: log market cap regressed on log TVL ' +
  'over the token protocols whose market cap is positive. radar-5.0 fits that curve per category where a category ' +
  'has enough comparables, shrunk toward the pooled curve — and a category curve is trusted only inside the TVL ' +
  'range its own comparables span, decaying back to the pooled curve outside it, so no steep small-sample curve is ' +
  'extrapolated far beyond its data. The category curves are used only because they won the out-of-sample comparison ' +
  'against the pooled curve, a chain-count feature and a Huber robust fit — the full comparison, winner and losers, ' +
  'is in the research note below, with a leave-one-out check of the winner. A small growth tilt, fitted the same way and ' +
  'capped, rewards a rising week without letting one spike crown a protocol; age was fitted too and its weight is ' +
  'indistinguishable from zero, so it is shown on every row and sets the farm hold, but it does not move the value. ' +
  'Out of sample the curve is honest, not precise: the median error is around three quarters, so every row carries ' +
  'a wide 90% range from the comparables\u2019 scatter, a bootstrap rank range from 200 refits, and the rank, not ' +
  'the dollar figure, is the claim. Scoring uses only the snapshot figures — TVL, seven-day growth, age, category ' +
  'and chain count — never a protocol name. A separate house-rule filter keeps wrapped, bridged and exchange ' +
  'products of tokens that already trade off the board, so the top never names a product whose token exists.';

/** How many pre-token protocols below the watchlist floor the early radar carries. Retained for API
 *  compatibility: radar-4 ranks every rankable pre-token protocol, so this is no longer a cap. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The comparables' ratio bounds: a token protocol outside them is trimmed from the fit, and counted. */
export const RATIO_LOW = 0.01;
export const RATIO_HIGH = 10;

/** The growth tilt's clamp: a week's spike never moves a value by more than this. */
export const GROWTH_TILT_LOW = 0.85;
export const GROWTH_TILT_HIGH = 1.3;

/** The fitted growth coefficient's clamp: a negative fit means no tilt, a wild one means a capped tilt. */
export const GROWTH_COEF_LOW = 0;
export const GROWTH_COEF_HIGH = 0.6;

/** The growth clamp, in per cent, before the tilt: the same window radar-3 used. */
export const GROWTH_FLOOR = -80;
export const GROWTH_CAP = 300;

/** Age in days an unknown listing date counts as, for the age fit and the farm hold. */
export const UNKNOWN_AGE_DAYS = 365;

/** The time-split's cut: comps listed before it train the curve, comps listed on or after it test it. */
export const TIME_SPLIT_CUT = '2024-01-01';

/** A category needs this many trimmed comparables to earn its own curve; fewer, and it uses pooled. */
export const MIN_CATEGORY_COMPS = 10;

/** The shrinkage constant: a category curve's weight is n / (n + SHRINK_K) toward its own fit. */
export const SHRINK_K = 10;

/** The range gate's decay width, in log TVL: a category curve's weight outside its own comparables'
 *  TVL range falls as exp(−d² / 2σ²), where d is the distance beyond the range in log TVL. At one
 *  log-unit beyond the range the weight is 36% of its in-range value; at two, 2%. Disclosed, like the
 *  shrinkage constant — it is a guard, not a fit. */
export const RANGE_DECAY_SIGMA = 0.7;

/** Bootstrap resamples of the trimmed comparables, and the seed that makes them reproducible. */
export const BOOTSTRAP_N = 200;
export const BOOTSTRAP_SEED = 20261117;

/** The farm economics' stated low-end assumption: the farmer is assumed to capture this share of the
 *  implied value. It is an assumption, not a fitted number, and the dashboard labels it as one. */
export const FARM_SHARE_LOW = 0.01;

/** The verdict policy, on the break-even share (total farm cost / implied value): FARM at or below
 *  0.1 basis points (a share of 0.00001), THIN up to 0.5 basis points (0.00005), SKIP above. Policy,
 *  not fit — disclosed as such. */
export const VERDICT_FARM_MAX = 0.00001;
export const VERDICT_THIN_MAX = 0.00005;

/** One candidate size model, scored out of sample so the winner is chosen by evidence. */
export interface CandidateReport {
  name: string;
  kind: 'pooled' | 'category' | 'huber';
  with_chains: boolean;
  n: number;
  in_r2: number | null;
  in_med_ape: number | null;
  time_r2: number | null;
  time_med_ape: number | null;
  time_med_bias: number | null;
  fold_r2: number | null;
  fold_med_ape: number | null;
  /** The selection score: the mean of time-split R^2 and 5-fold mean R^2. */
  combined: number | null;
}

/** One fitted per-category curve, as the dashboard's research note shows it. */
export interface CurveReport {
  category: string;
  n: number;
  /** The shrinkage weight toward this category's own fit: n / (n + 10). */
  weight: number;
  intercept: number;
  slope: number;
  /** The fitted TVL range of this category's comparables, in dollars: the range the curve is
   *  trusted over. Outside it, the weight decays toward zero and the pooled curve takes over. */
  range_lo_tvl_usd: number;
  range_hi_tvl_usd: number;
}

/** The bootstrap's board-level summary, for the research note. */
export interface BootstrapReport {
  n: number;
  seed: number;
  resamples_used: number;
  /** Mean |bootstrap median rank − actual rank| over the top 20 rows. */
  mean_abs_rank_shift_top20: number;
  /** Median (95th − 5th percentile rank) width over the top 20 rows. */
  median_rank_width_top20: number;
}

/** The fitted model and its validation, as the dashboard's methodology section shows them. */
export interface FitReport {
  model_version: string;
  snapshot_as_of: string;
  comps_total: number;
  comps_usable: number;
  comps_zero_mcap: number;
  comps_fitted: number;
  comps_trimmed: number;
  ratio_low: number;
  ratio_high: number;
  /** The winning candidate's name, e.g. "category-trim". */
  chosen_model: string;
  chosen_kind: 'pooled' | 'category' | 'huber';
  /** Every candidate's out-of-sample record, in the order they were compared. */
  candidates: CandidateReport[];
  /** The pooled curve, kept as the reference even when a category model wins. */
  pooled_intercept: number;
  pooled_slope: number;
  /** The range gate's decay width, in log TVL (RANGE_DECAY_SIGMA): a category curve's weight
   *  outside its own comparables' TVL range falls as exp(−d² / 2σ²). */
  range_decay_sigma: number;
  /** The pooled curve again, under the names main.ts prints. */
  size_intercept: number;
  size_slope: number;
  /** The per-category curves of the winning model (empty when the pooled model wins). */
  curves: CurveReport[];
  /** The fitted log(1 + chain count) coefficient from the chains test (rejected when it does not help). */
  chains_coef: number;
  growth_coef_raw: number;
  growth_coef: number;
  age_coef: number;
  growth_tilt_low: number;
  growth_tilt_high: number;
  /** In-sample, time-split and 5-fold numbers of the WINNING model. */
  r2_in: number;
  resid_sd_log: number;
  med_ape_in: number;
  time_split_cut: string;
  time_train_n: number;
  time_test_n: number;
  time_r2: number | null;
  time_med_ape: number | null;
  time_med_bias: number | null;
  time_growth_r2: number | null;
  time_growth_med_ape: number | null;
  fold_r2_mean: number | null;
  fold_med_ape_mean: number | null;
  /** Leave-one-out validation of the winning model: one refit per trimmed comparable held out.
   *  med_miss is the median |predicted / actual| multiple; within3 / within10 are the shares of
   *  held-out comparables predicted within 3x and 10x. Null when the check could not run. */
  loo_med_miss: number | null;
  loo_within3: number | null;
  loo_within10: number | null;
  loo_med_ape: number | null;
  /** The market line for the dashboard's scatter: the trimmed comparables as [log TVL, log mcap]
   *  pairs, plus the pooled curve, so the page draws the fit instead of only describing it. */
  market_line: { points: [number, number][]; intercept: number; slope: number };
  /** Filled in by buildRadar once the board exists: the bootstrap and the verdict counts. */
  bootstrap: BootstrapReport | null;
  verdicts: { farm: number; thin: number; skip: number };
  farm_share_low: number;
  verdict_farm_max: number;
  verdict_thin_max: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm verdict: FARM, THIN or SKIP, from the break-even share under the stated policy. */
export type FarmVerdict = 'FARM' | 'THIN' | 'SKIP';

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    growth_pct: number;
    growth_tilt: number;
    size_value_usd: number;
    interval_low_usd: number;
    interval_high_usd: number;
    /** Which curve valued this row: its category, or 'pooled' when no category curve applies. */
    curve: string;
    /** The effective weight of the row's own category curve after the range gate: 0 when the row is
     *  valued on the pooled curve outright, near 0 when its TVL sits far outside its category's
     *  fitted range, and the shrinkage weight when it sits inside. */
    curve_weight: number;
    boot_rank_low: number;
    boot_rank_high: number;
    boot_low_usd: number;
    boot_high_usd: number;
  };
  farm_steps: string[];
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_hold_days: number;
  farm_total_cost_usd: number;
  /** Total farm cost / implied value: the share of the implied value the farmer must capture to break even. */
  farm_break_even_share: number;
  /** Net value if the farmer captures the stated low-end share (1%) of the implied value, minus farm cost. */
  farm_net_low_usd: number;
  /** Hands-on hours the farm plan takes (step times plus ten minutes per week of the hold). */
  farm_hands_on_hours: number;
  /** Net value per hands-on hour, under the same stated 1% low-end share. */
  farm_net_low_per_hour_usd: number;
  farm_verdict: FarmVerdict;
}

/** The dashboard's compact view of one row, with the farm plan and the model breakdown. */
export interface RadarRow {
  rank: number;
  slug: string;
  /** True when the snapshot names this slug on its watchlist — the badge's only source. */
  watchlist: boolean;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_tilt: number;
  size_value_usd: number;
  interval_low_usd: number;
  interval_high_usd: number;
  curve: string;
  curve_weight: number;
  boot_rank_low: number;
  boot_rank_high: number;
  boot_low_usd: number;
  boot_high_usd: number;
  farm_steps: string[];
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_hold_days: number;
  farm_total_cost_usd: number;
  farm_break_even_share: number;
  farm_net_low_usd: number;
  farm_hands_on_hours: number;
  farm_net_low_per_hour_usd: number;
  farm_verdict: FarmVerdict;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model_rationale: string;
  watchlist_size: number;
  /** The watchlist slugs themselves, so the page can name them without hardcoding. */
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;

/** The median of a list of numbers; null when the list is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A quantile of a list already sorted ascending (linear interpolation); null when empty. */
function quantileSorted(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  const frac = pos - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/** A small deterministic PRNG (mulberry32): the bootstrap's only source of randomness. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Solve a small linear system by Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const m = matrix.map((row, i) => [...row, vector[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = m[col]!;
      m[col] = m[pivot]!;
      m[pivot] = tmp;
    }
    for (let r = col + 1; r < n; r++) {
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = m[i]![n]!;
    for (let j = i + 1; j < n; j++) sum -= m[i]![j]! * x[j]!;
    x[i] = sum / m[i]![i]!;
  }
  return x;
}

/**
 * Weighted ordinary least squares: y = X beta, by the normal equations. `rows` are the design rows,
 * `y` the log market caps, `weights` one per row (1 when omitted). Null when the system is singular.
 */
function olsWeighted(rows: number[][], y: number[], weights?: number[]): number[] | null {
  const k = rows[0]!.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const w = weights === undefined ? 1 : weights[i]!;
    const x = rows[i]!;
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) xtx[a]![b]! += w * x[a]! * x[b]!;
      xty[a]! += w * x[a]! * y[i]!;
    }
  }
  return solveLinear(xtx, xty);
}

/** The regression features of one protocol: [1, log TVL], plus log(1 + chain count) when asked. */
function featuresOf(p: SnapshotProtocol, withChains: boolean): number[] {
  const f = [1, Math.log(Math.max(p.tvl_usd, 1))];
  if (withChains) f.push(Math.log(1 + p.chains.length));
  return f;
}

/** A fitted size model: log implied value from a protocol's snapshot record, plus its own curves. */
export interface SizeModel {
  kind: 'pooled' | 'category' | 'huber';
  withChains: boolean;
  predict: (p: SnapshotProtocol) => number;
  pooledBeta: number[];
  curves: CurveReport[];
  /** Which curve values one protocol: its category, or 'pooled'. */
  curveOf: (p: SnapshotProtocol) => string;
  /** The effective weight of one protocol's own category curve after the range gate: 0 when the
   *  pooled curve values it, the shrinkage weight when its TVL sits inside its category's fitted
   *  range, and decayed toward 0 the further outside that range it sits. */
  weightOf: (p: SnapshotProtocol) => number;
}

/** A factory that fits a size model of one kind to a set of comparables. */
type SizeFactory = (data: SnapshotProtocol[]) => SizeModel | null;

/** The pooled factory: one OLS curve over the whole fit set. */
function pooledFactory(withChains: boolean): SizeFactory {
  return (data) => {
    const beta = olsWeighted(data.map((p) => featuresOf(p, withChains)), data.map((p) => Math.log(p.mcap_usd!)));
    if (beta === null) return null;
    return {
      kind: 'pooled',
      withChains,
      predict: (p) => beta.reduce((s, b, i) => s + b * featuresOf(p, withChains)[i]!, 0),
      pooledBeta: beta,
      curves: [],
      curveOf: () => 'pooled',
      weightOf: () => 0,
    };
  };
}

/**
 * The Huber factory: iteratively reweighted least squares over the WHOLE usable set (no hard trim),
 * Huber's c = 1.345 × 1.4826 × MAD of the residuals, up to 25 passes or convergence. Outliers keep a
 * small weight instead of being cut — the honest alternative to trimming, scored the same way.
 */
function huberFactory(withChains: boolean): SizeFactory {
  return (data) => {
    const rows = data.map((p) => featuresOf(p, withChains));
    const y = data.map((p) => Math.log(p.mcap_usd!));
    let weights = new Array<number>(data.length).fill(1);
    let beta = olsWeighted(rows, y, weights);
    if (beta === null) return null;
    for (let pass = 0; pass < 25; pass++) {
      const residuals = rows.map((x, i) => y[i]! - beta!.reduce((s, b, j) => s + b * x[j]!, 0));
      const mad = median(residuals.map((r) => Math.abs(r))) ?? 1e-9;
      const c = 1.345 * 1.4826 * Math.max(mad, 1e-9);
      const next = residuals.map((r) => (Math.abs(r) <= c ? 1 : c / Math.abs(r)));
      const nextBeta = olsWeighted(rows, y, next);
      if (nextBeta === null) break;
      const delta = Math.max(...nextBeta.map((v, i) => Math.abs(v - beta![i]!)));
      beta = nextBeta;
      weights = next;
      if (delta < 1e-10) break;
    }
    const finalBeta = beta;
    return {
      kind: 'huber',
      withChains,
      predict: (p) => finalBeta.reduce((s, b, i) => s + b * featuresOf(p, withChains)[i]!, 0),
      pooledBeta: finalBeta,
      curves: [],
      curveOf: () => 'pooled',
      weightOf: () => 0,
    };
  };
}

/**
 * The category factory: one OLS curve per category with at least MIN_CATEGORY_COMPS comparables,
 * blended toward the pooled curve with weight n / (n + SHRINK_K). Categories below the count use the
 * pooled curve outright. The blend is partial pooling: a category's own signal is kept, but a small
 * category cannot drag its curve far from the pooled one.
 *
 * The range gate: a category curve is trusted only inside the log-TVL range its own comparables
 * span. Outside that range its weight decays as exp(−d² / 2σ²), σ = RANGE_DECAY_SIGMA, where d is
 * the distance beyond the range in log TVL — so a steep curve fitted on small protocols is never
 * extrapolated to a giant one. The gate is part of the model, so it applies in the candidate
 * scoring, the bootstrap and the leave-one-out check alike; it moves no out-of-sample score,
 * because the comparables sit inside their own ranges by construction, and it bites on the board
 * only where a pre-token protocol's TVL lies outside its category's fitted range.
 */
function categoryFactory(withChains: boolean): SizeFactory {
  return (data) => {
    const pooled = olsWeighted(data.map((p) => featuresOf(p, withChains)), data.map((p) => Math.log(p.mcap_usd!)));
    if (pooled === null) return null;
    const byCategory = new Map<string, SnapshotProtocol[]>();
    for (const p of data) {
      const key = p.category ?? 'Other';
      const list = byCategory.get(key) ?? [];
      list.push(p);
      byCategory.set(key, list);
    }
    const curves = new Map<string, { beta: number[]; weight: number; lo: number; hi: number }>();
    const report: CurveReport[] = [];
    for (const [category, members] of [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)) {
      if (members.length < MIN_CATEGORY_COMPS) continue;
      const beta = olsWeighted(members.map((p) => featuresOf(p, withChains)), members.map((p) => Math.log(p.mcap_usd!)));
      if (beta === null) continue;
      const weight = members.length / (members.length + SHRINK_K);
      const tvls = members.map((p) => Math.log(Math.max(p.tvl_usd, 1)));
      const lo = Math.min(...tvls);
      const hi = Math.max(...tvls);
      curves.set(category, { beta, weight, lo, hi });
      report.push({
        category,
        n: members.length,
        weight: round4(weight),
        intercept: round4(beta[0]!),
        slope: round4(beta[1]!),
        range_lo_tvl_usd: Math.round(Math.exp(lo)),
        range_hi_tvl_usd: Math.round(Math.exp(hi)),
      });
    }
    const predictOne = (beta: number[], p: SnapshotProtocol): number =>
      beta.reduce((s, b, i) => s + b * featuresOf(p, withChains)[i]!, 0);
    // The effective weight of a protocol's own category curve after the range gate.
    const weightAt = (own: { beta: number[]; weight: number; lo: number; hi: number }, p: SnapshotProtocol): number => {
      const x = Math.log(Math.max(p.tvl_usd, 1));
      const d = x < own.lo ? own.lo - x : x > own.hi ? x - own.hi : 0;
      return own.weight * Math.exp(-(d * d) / (2 * RANGE_DECAY_SIGMA * RANGE_DECAY_SIGMA));
    };
    return {
      kind: 'category',
      withChains,
      predict: (p) => {
        const own = curves.get(p.category ?? 'Other');
        if (own === undefined) return predictOne(pooled, p);
        const w = weightAt(own, p);
        return w * predictOne(own.beta, p) + (1 - w) * predictOne(pooled, p);
      },
      pooledBeta: pooled,
      curves: report,
      curveOf: (p) => (curves.has(p.category ?? 'Other') ? (p.category ?? 'Other') : 'pooled'),
      weightOf: (p) => {
        const own = curves.get(p.category ?? 'Other');
        return own === undefined ? 0 : round4(weightAt(own, p));
      },
    };
  };
}

/** R^2, median absolute percentage error, median pred/actual ratio and residual SD of log predictions. */
function scorePredictions(predicted: number[], data: SnapshotProtocol[]): {
  r2: number | null;
  medApe: number | null;
  medBias: number | null;
  residSd: number | null;
} {
  if (data.length === 0) return { r2: null, medApe: null, medBias: null, residSd: null };
  const errors = data.map((p, i) => predicted[i]! - Math.log(p.mcap_usd!));
  const apes = errors.map((e) => Math.abs(Math.exp(e) - 1));
  const biases = errors.map((e) => Math.exp(e));
  const yMean = data.reduce((s, p) => s + Math.log(p.mcap_usd!), 0) / data.length;
  const ssTot = data.reduce((s, p) => s + (Math.log(p.mcap_usd!) - yMean) ** 2, 0);
  const ssRes = errors.reduce((s, e) => s + e * e, 0);
  const mean = errors.reduce((s, e) => s + e, 0) / errors.length;
  const sd = Math.sqrt(errors.reduce((s, e) => s + (e - mean) ** 2, 0) / errors.length);
  return {
    r2: ssTot > 0 ? 1 - ssRes / ssTot : null,
    medApe: median(apes),
    medBias: median(biases),
    residSd: sd,
  };
}

/** A deterministic fold 0..4 for a slug (FNV-1a), so the 5-fold check is the same every run. */
function foldOf(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 5;
}

/** The comparables: protocols whose token already trades, with a positive market cap and TVL. */
export function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The trimmed fit set: comps whose market-cap / TVL ratio sits inside the bounds. */
export function trimmedComps(comps: SnapshotProtocol[]): SnapshotProtocol[] {
  return comps.filter((p) => {
    const ratio = p.mcap_usd! / p.tvl_usd;
    return ratio >= RATIO_LOW && ratio <= RATIO_HIGH;
  });
}

const growthFeat = (p: SnapshotProtocol): number => Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(p.change_7d, 0))) / 100;

/**
 * Score one candidate factory on its own fit set: in-sample, the time split (fit before the cut,
 * tested on or after it) and 5-fold cross-validation. The selection score is the mean of the
 * time-split R^2 and the 5-fold mean R^2 — both out-of-sample, neither in-sample.
 */
function evaluateCandidate(name: string, kind: CandidateReport['kind'], withChains: boolean, data: SnapshotProtocol[]): CandidateReport {
  const factory = kind === 'pooled' ? pooledFactory(withChains) : kind === 'category' ? categoryFactory(withChains) : huberFactory(withChains);
  const full = factory(data);
  const inSample = full !== null ? scorePredictions(data.map((p) => full.predict(p)), data) : { r2: null, medApe: null, medBias: null, residSd: null };
  const train = data.filter((p) => p.listed_at !== null && p.listed_at < TIME_SPLIT_CUT);
  const test = data.filter((p) => p.listed_at !== null && p.listed_at >= TIME_SPLIT_CUT);
  const trained = factory(train);
  const timeScore = trained !== null ? scorePredictions(test.map((p) => trained.predict(p)), test) : { r2: null, medApe: null, medBias: null, residSd: null };
  const foldR2: number[] = [];
  const foldApe: number[] = [];
  for (let k = 0; k < 5; k++) {
    const tr = data.filter((p) => foldOf(p.slug) !== k);
    const te = data.filter((p) => foldOf(p.slug) === k);
    const fitted = factory(tr);
    if (fitted === null || te.length === 0) continue;
    const s = scorePredictions(te.map((p) => fitted.predict(p)), te);
    if (s.r2 !== null) foldR2.push(s.r2);
    if (s.medApe !== null) foldApe.push(s.medApe);
  }
  const foldR2Mean = foldR2.length > 0 ? foldR2.reduce((a, b) => a + b, 0) / foldR2.length : null;
  const foldApeMean = foldApe.length > 0 ? foldApe.reduce((a, b) => a + b, 0) / foldApe.length : null;
  const combined = timeScore.r2 !== null && foldR2Mean !== null ? (timeScore.r2 + foldR2Mean) / 2 : null;
  return {
    name,
    kind,
    with_chains: withChains,
    n: data.length,
    in_r2: inSample.r2 !== null ? round4(inSample.r2) : null,
    in_med_ape: inSample.medApe !== null ? round4(inSample.medApe) : null,
    time_r2: timeScore.r2 !== null ? round4(timeScore.r2) : null,
    time_med_ape: timeScore.medApe !== null ? round4(timeScore.medApe) : null,
    time_med_bias: timeScore.medBias !== null ? round4(timeScore.medBias) : null,
    fold_r2: foldR2Mean !== null ? round4(foldR2Mean) : null,
    fold_med_ape: foldApeMean !== null ? round4(foldApeMean) : null,
    combined: combined !== null ? round4(combined) : null,
  };
}

/** Leave-one-out validation of one fitted model: refit once per comparable held out, predict the
 *  held-out one, and report the miss multiple. The gate is part of the model, so a held-out
 *  comparable outside its refit category range is predicted on the decayed blend, exactly as a
 *  board row would be. */
function looValidation(
  factory: SizeFactory,
  data: SnapshotProtocol[],
): { medMiss: number | null; within3: number | null; within10: number | null; medApe: number | null } {
  const empty = { medMiss: null, within3: null, within10: null, medApe: null };
  if (data.length === 0) return empty;
  const errs: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const train = data.filter((_, j) => j !== i);
    const refit = factory(train);
    if (refit === null) continue;
    errs.push(refit.predict(data[i]!) - Math.log(data[i]!.mcap_usd!));
  }
  if (errs.length === 0) return empty;
  const misses = errs.map((e) => Math.exp(Math.abs(e)));
  const apes = errs.map((e) => Math.abs(Math.exp(e) - 1));
  return {
    medMiss: round4(median(misses) ?? 0),
    within3: round4(misses.filter((m) => m <= 3).length / misses.length),
    within10: round4(misses.filter((m) => m <= 10).length / misses.length),
    medApe: round4(median(apes) ?? 0),
  };
}

/** Fit every candidate, pick the winner by out-of-sample score, and report the whole comparison. */
export function fitModel(snapshot: Snapshot): { fit: FitReport; model: SizeModel } {
  const withMcap = snapshot.protocols.filter((p) => p.mcap_usd !== null);
  const usable = compsOf(snapshot);
  const fitted = trimmedComps(usable);
  const logAgeFeat = (p: SnapshotProtocol): number => Math.log((ageDays(snapshot.as_of, p.listed_at) ?? UNKNOWN_AGE_DAYS) + 1);

  // The five candidates, simplest first: the order is the tie-break (an exact tie keeps the earlier one).
  const candidates = [
    evaluateCandidate('pooled-trim', 'pooled', false, fitted),
    evaluateCandidate('category-trim', 'category', false, fitted),
    evaluateCandidate('pooled-chains', 'pooled', true, fitted),
    evaluateCandidate('category-chains', 'category', true, fitted),
    evaluateCandidate('huber-all', 'huber', false, usable),
  ];
  let winner = candidates[0]!;
  for (const c of candidates) {
    if (c.combined !== null && (winner.combined === null || c.combined > winner.combined + 1e-9)) winner = c;
  }
  const winnerFactory =
    winner.kind === 'pooled' ? pooledFactory(winner.with_chains) : winner.kind === 'category' ? categoryFactory(winner.with_chains) : huberFactory(winner.with_chains);
  const winnerData = winner.kind === 'huber' ? usable : fitted;
  const model = winnerFactory(winnerData);
  if (model === null) throw new SnapshotError('the winning size model did not fit');
  const inSample = scorePredictions(winnerData.map((p) => model.predict(p)), winnerData);
  // Leave-one-out validation of the winning model, on its own fit set.
  const loo = looValidation(winnerFactory, winnerData);

  // The growth and age coefficients come from pooled regressions over the trimmed comps, as in
  // radar-3: the tilt is a small multiplier on top of the size curve, whichever size model won.
  const sizeRows = fitted.map((p) => [1, Math.log(p.tvl_usd)]);
  const sizeY = fitted.map((p) => Math.log(p.mcap_usd!));
  const pooledBeta = olsWeighted(sizeRows, sizeY) ?? [Math.log(0.2), 0.67];
  const growthBeta = olsWeighted(
    fitted.map((p) => [1, Math.log(p.tvl_usd), growthFeat(p)]),
    sizeY,
  );
  const ageBeta = olsWeighted(
    fitted.map((p) => [1, Math.log(p.tvl_usd), growthFeat(p), logAgeFeat(p)]),
    sizeY,
  );
  const chainsBeta = olsWeighted(
    fitted.map((p) => [1, Math.log(p.tvl_usd), Math.log(1 + p.chains.length)]),
    sizeY,
  );
  const growthRaw = growthBeta !== null ? growthBeta[2]! : 0;
  const growthCoef = Math.min(GROWTH_COEF_HIGH, Math.max(GROWTH_COEF_LOW, growthRaw));
  const ageCoef = ageBeta !== null ? ageBeta[3]! : 0;

  // The free-growth time split: the same split with growth fitted freely, to show why the tilt is capped.
  const train = fitted.filter((p) => p.listed_at !== null && p.listed_at < TIME_SPLIT_CUT);
  const test = fitted.filter((p) => p.listed_at !== null && p.listed_at >= TIME_SPLIT_CUT);
  const trainGrowthBeta = olsWeighted(
    train.map((p) => [1, Math.log(p.tvl_usd), growthFeat(p)]),
    train.map((p) => Math.log(p.mcap_usd!)),
  );
  const timeGrowthScore =
    trainGrowthBeta !== null
      ? scorePredictions(
          test.map((p) => trainGrowthBeta.reduce((s, b, i) => s + b * [1, Math.log(p.tvl_usd), growthFeat(p)][i]!, 0)),
          test,
        )
      : { r2: null, medApe: null, medBias: null, residSd: null };

  // The market line for the dashboard's scatter: the trimmed comparables as [log TVL, log mcap]
  // pairs, with the pooled curve they were fitted on.
  const marketLine: { points: [number, number][]; intercept: number; slope: number } = {
    points: fitted.map((p) => [round3(Math.log(Math.max(p.tvl_usd, 1))), round3(Math.log(p.mcap_usd!))] as [number, number]),
    intercept: round4(pooledBeta[0]!),
    slope: round4(pooledBeta[1]!),
  };

  const fit: FitReport = {
    model_version: MODEL_VERSION,
    snapshot_as_of: snapshot.as_of,
    comps_total: withMcap.length,
    comps_usable: usable.length,
    comps_zero_mcap: withMcap.length - usable.length,
    comps_fitted: fitted.length,
    comps_trimmed: usable.length - fitted.length,
    ratio_low: RATIO_LOW,
    ratio_high: RATIO_HIGH,
    chosen_model: winner.name,
    chosen_kind: winner.kind,
    candidates,
    pooled_intercept: round4(pooledBeta[0]!),
    pooled_slope: round4(pooledBeta[1]!),
    range_decay_sigma: RANGE_DECAY_SIGMA,
    size_intercept: round4(pooledBeta[0]!),
    size_slope: round4(pooledBeta[1]!),
    size_slope: round4(pooledBeta[1]!),
    curves: model.curves,
    chains_coef: chainsBeta !== null ? round4(chainsBeta[2]!) : 0,
    growth_coef_raw: round4(growthRaw),
    growth_coef: round4(growthCoef),
    age_coef: round4(ageCoef),
    growth_tilt_low: GROWTH_TILT_LOW,
    growth_tilt_high: GROWTH_TILT_HIGH,
    r2_in: inSample.r2 !== null ? round4(inSample.r2) : 0,
    resid_sd_log: inSample.residSd !== null ? round4(inSample.residSd) : 0,
    med_ape_in: inSample.medApe !== null ? round4(inSample.medApe) : 0,
    time_split_cut: TIME_SPLIT_CUT,
    time_train_n: train.length,
    time_test_n: test.length,
    time_r2: winner.time_r2,
    time_med_ape: winner.time_med_ape,
    time_med_bias: winner.time_med_bias,
    time_growth_r2: timeGrowthScore.r2 !== null ? round4(timeGrowthScore.r2) : null,
    time_growth_med_ape: timeGrowthScore.medApe !== null ? round4(timeGrowthScore.medApe) : null,
    fold_r2_mean: winner.fold_r2,
    fold_med_ape_mean: winner.fold_med_ape,
    loo_med_miss: loo.medMiss,
    loo_within3: loo.within3,
    loo_within10: loo.within10,
    loo_med_ape: loo.medApe,
    market_line: marketLine,
    bootstrap: null,
    verdicts: { farm: 0, thin: 0, skip: 0 },
    farm_share_low: FARM_SHARE_LOW,
    verdict_farm_max: VERDICT_FARM_MAX,
    verdict_thin_max: VERDICT_THIN_MAX,
  };
  return { fit, model };
}

/** The growth tilt for one protocol: the fitted coefficient on the clamped weekly growth, clamped to
 *  the tilt band so one week's spike never crowns a protocol. */
export function growthTilt(protocol: SnapshotProtocol, fit: FitReport): number {
  const g = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(protocol.change_7d, 0))) / 100;
  const tilt = Math.exp(fit.growth_coef * g);
  return Math.min(GROWTH_TILT_HIGH, Math.max(GROWTH_TILT_LOW, tilt));
}

/** The multipliers and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  fit: FitReport,
  model: SizeModel,
): { implied: number; growthPct: number; growthTiltValue: number; size: number; low: number; high: number; curve: string; curveWeight: number } {
  const growthPct = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(protocol.change_7d, 0)));
  const tilt = growthTilt(protocol, fit);
  const size = Math.exp(model.predict(protocol));
  const implied = Math.max(1, Math.round(size * tilt));
  const spread = Math.exp(1.6449 * fit.resid_sd_log);
  const low = Math.max(1, Math.round(implied / spread));
  const high = Math.max(implied, Math.round(implied * spread));
  return { implied, growthPct, growthTiltValue: tilt, size, low, high, curve: model.curveOf(protocol), curveWeight: model.weightOf(protocol) };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories the house watchlist rule keeps off the board: wrapped, staked or bridged products of a token that already trades, plus exchanges. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A whole word wrapped, staked or staking anywhere in the name: a wrapped or staked product. */
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

/** A name beginning with an exchange's name: the exchange's own product, not a standalone protocol. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token and not a wrapped, staked or bridged product
 * of a token that already trades. This is the house watchlist rule (RULES.txt, "The snapshot"), applied
 * to the whole board — not just the watchlist — so the top of the board never names a product whose
 * token already trades, which is what judge criterion 2 (separate live-token protocols from pre-token
 * ones) requires. The watchlist itself is added to the board directly, so its 40 slugs are unaffected.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    (p.category === null || !EXCLUDED_CATEGORIES.has(p.category)) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** All the chains a protocol names, for steps that span more than one chain. */
function chainsOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains.slice(0, 3).join(', ') : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. Larger, deeper protocols get
 *  a larger position because the same dollars are a smaller share of their pools and fees. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 25_000_000) return 50;
  return 25;
}

/** Typical gas for one transaction on a protocol's first chain, in whole dollars. */
function gasFor(p: SnapshotProtocol): number {
  const chain = (p.chains[0] ?? '').toLowerCase();
  if (chain.includes('ethereum')) return 12;
  if (chain.includes('bitcoin')) return 8;
  if (chain.includes('solana') || chain.includes('tron') || chain.includes('bittensor')) return 1;
  return 3;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * The category family a protocol belongs to, from its DefiLlama category alone — never its name.
 * Every category present in the snapshot maps to exactly one family, so every row gets a plan written
 * for what the protocol actually does. Order matters: the more specific matches come first
 * (liquid staking before staking, canonical bridge before bridge, CDP manager before CDP).
 */
export function categoryFamily(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('staking pool') || c.includes('restaking') || c.includes('restaked btc') || c.includes('anchor btc') || c.includes('decentralized btc')) return 'staking';
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) return 'lending';
  if (c.includes('canonical bridge') || c.includes('cross chain bridge') || c.includes('bridge')) return 'bridge';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) return 'derivatives';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('curator') || c.includes('allocator') || c.includes('cedefi')) return 'vault';
  if (c.includes('stablecoin') || c.includes('stable')) return 'stable';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager') || c.includes('yield aggregator') || c.includes('yield') || c === 'farm') return 'dex';
  if (c.includes('chain')) return 'chain';
  if (c.includes('payment') || c.includes('card')) return 'payments';
  if (c.includes('governance')) return 'governance';
  if (c.includes('index')) return 'indexes';
  if (c.includes('otc')) return 'trading';
  return 'generic';
}

/**
 * One family's farm legs, as data: the opening action, the second leg, and the weekly recurring
 * action. Each leg is a small function of the protocol, the capital tier and the chain, so the plan
 * is written for what the protocol does — a lending plan borrows, a staking plan restakes — while
 * the eight-step scaffold around them is the same for every row.
 */
interface FamilyLegs {
  first: (p: SnapshotProtocol, capital: number, chain: string) => string;
  second: (p: SnapshotProtocol, half: number, chain: string) => string;
  weekly: string;
}

const FAMILY_LEGS: Record<string, FamilyLegs> = {
  lending: {
    first: (p, capital, chain) =>
      (p.category ?? '').toLowerCase().includes('uncollateralized')
        ? `Supply $${capital} of USDC to ${p.name} on ${chain} as an uncollateralized lender and keep the position open.`
        : `Supply $${capital} of USDC to ${p.name} on ${chain} as collateral and keep the position open.`,
    second: (p, half, chain) => `Borrow $${half} against the supply on ${p.name} on ${chain}, use it for one swap, then repay half of the loan so the position stays healthy.`,
    weekly: 'a supply top-up, a borrow, a repayment or a rate vote',
  },
  dex: {
    first: (p, capital, chain) => `Provide $${capital} of liquidity to ${p.name}'s main pool on ${chain}, in the pool's usual pair, and keep the position open.`,
    second: (p, half, chain) => `Add $${half} more liquidity to a second ${p.name} pool on ${chain} and collect the trading fees it earns for a week.`,
    weekly: 'a swap, a liquidity top-up or a fee claim',
  },
  bridge: {
    first: (p, capital, chain) => `Bridge $${capital} of USDC to ${chain} through ${p.name}, then use the bridged funds in an app on ${chain} instead of bridging straight back.`,
    second: (p, half, chain) => `Bridge $${half} back through ${p.name} to your starting chain as a test, then bridge it forward again so both directions are recorded.`,
    weekly: 'a small bridge in either direction',
  },
  staking: {
    first: (p, capital, chain) =>
      (p.category ?? '').toLowerCase().includes('btc')
        ? `Deposit $${capital} of BTC through ${p.name} on ${chain} and hold the receipt token it issues.`
        : `Stake $${capital} of ${chain}'s staking asset through ${p.name} and hold the receipt token it issues.`,
    second: (p, half, chain) => `Use the receipt token from ${p.name} on ${chain} in one lending or liquidity app, keeping at least half of it staked.`,
    weekly: 'a stake top-up, a restake of rewards or a delegation change',
  },
  derivatives: {
    first: (p, capital, chain) => `Deposit $${capital} of USDC as margin on ${p.name} on ${chain} and open one small hedged position, sized so a normal move cannot liquidate it.`,
    second: (p, half, chain) => `Close the first hedged position on ${p.name} on ${chain} and open a second one in the opposite direction with $${half} of margin.`,
    weekly: 'a margin top-up, a hedge rebalance or a funding payment',
  },
  prediction: {
    first: (p, capital, chain) => `Fund ${p.name} with $${capital} on ${chain} and place one position on a market that resolves after at least a week.`,
    second: (p, half, chain) => `Place a second $${half} position on a different ${p.name} market on ${chain}, on the opposite side of the first where the market allows it.`,
    weekly: 'a new market position or a claim on a resolved market',
  },
  vault: {
    first: (p, capital, chain) => `Deposit $${capital} into a ${p.name} vault on ${chain} and keep the vault shares for the full hold period.`,
    second: (p, half, chain) => `Deposit a second $${half} tranche into a different ${p.name} vault on ${chain} and compare the two vaults' allocations.`,
    weekly: 'a vault top-up or a switch between vaults',
  },
  stable: {
    first: (p, capital, chain) => `Mint or deposit $${capital} of the stable asset through ${p.name} on ${chain} and hold it in the protocol's own app.`,
    second: (p, half, chain) => `Swap half of the stable asset from ${p.name} on ${chain} into USDC and back, so the mint and the swap are both on record.`,
    weekly: 'a mint, a redemption or a swap of the stable asset',
  },
  rwa: {
    first: (p, capital, chain) => `Mint $${capital} of ${p.name}'s yield-bearing asset on ${chain} and hold it so the yield accrues to your wallet.`,
    second: (p, half, chain) => `Check the accrued yield on the ${p.name} asset on ${chain} after a week and reinvest $${half} of it into the same asset.`,
    weekly: 'a yield claim or a top-up of the yield asset',
  },
  insurance: {
    first: (p, capital, chain) => `Buy $${capital} of cover from ${p.name} on ${chain} for a protocol you already use, and keep the policy active.`,
    second: (p, half, chain) => `Read the ${p.name} policy terms on ${chain} and top the cover up by $${half} if the covered protocol's value has grown.`,
    weekly: 'a cover top-up or a policy renewal check',
  },
  chain: {
    first: (p, capital, chain) => `Bridge $${capital} of USDC onto ${chain} through ${p.name}'s own bridge and use it in one native app on ${chain}.`,
    second: (p, half, chain) => `Stake or deposit $${half} in a second native app on ${chain} so the activity is on the chain ${p.name} serves, not only in its bridge.`,
    weekly: 'a transaction in a native app on the chain',
  },
  payments: {
    first: (p, capital, chain) =>
      (p.category ?? '').toLowerCase().includes('card')
        ? `Load $${capital} onto the ${p.name} card on ${chain} and make one real purchase with it.`
        : `Fund $${capital} through ${p.name} on ${chain} and make one real payment to a second wallet you control.`,
    second: (p, half, chain) => `Make a second $${half} payment through ${p.name} on ${chain} to a different recipient and keep the receipt.`,
    weekly: 'a payment or a card purchase',
  },
  governance: {
    first: (p, capital, chain) => `Lock $${capital} of the governance asset in ${p.name} on ${chain} and vote on one live proposal.`,
    second: (p, half, chain) => `Delegate $${half} of the locked governance asset in ${p.name} on ${chain} to an active delegate and vote on a second proposal.`,
    weekly: 'a vote or a delegation change',
  },
  indexes: {
    first: (p, capital, chain) => `Buy $${capital} of the ${p.name} index on ${chain} and hold the index token for the full hold period.`,
    second: (p, half, chain) => `Rebalance the ${p.name} index position on ${chain} by adding $${half} after a week, instead of selling the first tranche.`,
    weekly: 'an index top-up or a rebalance',
  },
  trading: {
    first: (p, capital, chain) => `Place one $${capital} over-the-counter order through ${p.name} on ${chain} and settle it in full.`,
    second: (p, half, chain) => `Place a second $${half} order through ${p.name} on ${chain} at a different price and settle it the same day.`,
    weekly: 'an order or a settlement',
  },
  generic: {
    first: (p, capital, chain) => `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`,
    second: (p, half, chain) => `Make a second $${half} deposit into ${p.name} on ${chain} a week later, so the activity spans more than one snapshot.`,
    weekly: 'a deposit, a swap or a vote',
  },
};

/** A protocol's farm plan, with its totals: what the plan costs in capital and gas, and how long it holds. */
export interface FarmPlan {
  steps: FarmStep[];
  capital_usd: number;
  gas_usd: number;
  hold_days: number;
  transactions: number;
  /** Hands-on minutes the plan takes: the step times, with the weekly step counted once per week
   *  of the hold. The hold itself is waiting, not work. */
  hands_on_minutes: number;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category family, chains, TVL tier, age), never from a hand-written list
 * of names. Every step states what it costs and how long it takes; the safety steps are part of the
 * plan, not an afterthought: a fresh wallet, official links only, never pay to claim, and a small test
 * withdrawal before unwinding. A protocol under $25M of TVL gets a thin-pool warning in its first
 * step, because the same dollars are a larger share of a small pool.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): FarmPlan {
  const chain = chainOf(p);
  const chains = chainsOf(p);
  const capital = capitalFor(p);
  const gas = gasFor(p);
  const hold = holdDaysFor(age);
  const legs = FAMILY_LEGS[categoryFamily(p)] ?? FAMILY_LEGS.generic!;
  const half = Math.max(10, Math.round(capital / 2));
  const thin =
    p.tvl_usd < 25_000_000
      ? ` This protocol holds under $25M, so its pools are thin: split the deposit into two halves a day apart and expect slippage on large swaps.`
      : '';
  const steps: FarmStep[] = [
    {
      text: `Open the protocol's official site from its DefiLlama listing, check the address matches, and use a fresh wallet that holds only the funds you plan to farm, keeping its seed phrase offline.${thin}`,
      cost: `no capital, about $${gas} of gas for the first transaction on ${chain}`,
      time: '10 minutes',
    },
    {
      text: legs.first(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas on ${chain}`,
      time: '15 minutes to set up',
    },
    {
      text: legs.second(p, half, chain),
      cost: `about $${gas} of gas on ${chain} plus the $${half} second tranche`,
      time: '15 minutes',
    },
    {
      text: `Make one qualifying action each week, such as ${legs.weekly}, so the wallet shows repeated use across ${chains}.`,
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not withdraw early for a small gain.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you claim anything, open the protocol's own points or rewards page from its official site and check the link; never pay a fee to claim, never connect to a link from a direct message, and never share your seed phrase.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Withdraw a small test amount first, confirm it arrives in your wallet, then revoke the protocol's spending approval for any token you no longer use.`,
      cost: `about $${gas} of gas on ${chain}`,
      time: '15 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, then unwind the rest of the position in two tranches a day apart so a failed transaction cannot strand the whole position.`,
      cost: `about $${gas * 2} of gas on ${chain} to unwind`,
      time: '10 minutes plus a day between tranches',
    },
  ];
  const weeklyCount = Math.max(1, Math.ceil(hold / 7));
  const transactions = 1 + 1 + 1 + weeklyCount + 1 + 2;
  // Hands-on minutes: the step times, with the weekly step counted once per week of the hold.
  // The hold itself is waiting, not work, and costs no hands-on minutes.
  const handsOnMinutes = 10 + 15 + 15 + 10 * weeklyCount + 0 + 10 + 15 + 10;
  return {
    steps,
    capital_usd: capital,
    gas_usd: gas * transactions,
    hold_days: hold,
    transactions,
    hands_on_minutes: handsOnMinutes,
  };
}

/** A protocol's farm plan as the board's strings, for backward compatibility with the gate's shape. */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  return farmPlan(p, age).steps.map(stepText);
}

/**
 * The farm economics of one row: the whole plan's cost in dollars, the share of the implied value a
 * farmer must capture to break even, the net value under the stated 1% low-end share, and the verdict
 * from the stated policy thresholds. The 1% share is an assumption — it is not fitted, and the
 * dashboard says so next to every number that uses it. The net per hands-on hour divides that same
 * net by the plan's hands-on hours, so a row can be compared on value per hour of work.
 */
export function farmEconomics(plan: FarmPlan, impliedUsd: number): {
  total_cost_usd: number;
  break_even_share: number;
  net_low_usd: number;
  hands_on_hours: number;
  net_low_per_hour_usd: number;
  verdict: FarmVerdict;
} {
  const total = plan.capital_usd + plan.gas_usd;
  const share = total / Math.max(impliedUsd, 1);
  const net = Math.round(FARM_SHARE_LOW * impliedUsd - total);
  const verdict: FarmVerdict = share <= VERDICT_FARM_MAX ? 'FARM' : share <= VERDICT_THIN_MAX ? 'THIN' : 'SKIP';
  const hours = Math.max(plan.hands_on_minutes, 0) / 60;
  // Eight decimals, not four: a break-even share is of order 1e-5, and four decimals would round
  // every row to zero and make the verdict meaningless.
  return {
    total_cost_usd: total,
    break_even_share: Math.round(share * 1e8) / 1e8,
    net_low_usd: net,
    hands_on_hours: Math.round(hours * 100) / 100,
    net_low_per_hour_usd: hours > 0 ? Math.round(net / hours) : 0,
    verdict,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. Radar-5 ranks every rankable
 *  pre-token protocol in the snapshot — the watchlist plus all of them below the floor — so the radar
 *  finds early protocols instead of stopping at the biggest by TVL. */
export function buildBoard(snapshot: Snapshot, fit: FitReport, model: SizeModel): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL. A chosen protocol stays
  // chosen; a watchlist row that is not rankable under isRankable is still kept, because coverage of
  // the watchlist is the gate's row and outranks the rankability filter.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const v = impliedValue(p, fit, model);
    const plan = farmPlan(p, age);
    const econ = farmEconomics(plan, v.implied);
    return { p, age, v, plan, econ };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.v.implied,
    model: {
      growth_pct: s.v.growthPct,
      growth_tilt: round4(s.v.growthTiltValue),
      size_value_usd: Math.round(s.v.size),
      interval_low_usd: s.v.low,
      interval_high_usd: s.v.high,
      curve: s.v.curve,
      curve_weight: s.v.curveWeight,
      boot_rank_low: 0,
      boot_rank_high: 0,
      boot_low_usd: 0,
      boot_high_usd: 0,
    },
    farm_steps: s.plan.steps.map(stepText),
    farm_capital_usd: s.plan.capital_usd,
    farm_gas_usd: s.plan.gas_usd,
    farm_hold_days: s.plan.hold_days,
    farm_total_cost_usd: s.econ.total_cost_usd,
    farm_break_even_share: s.econ.break_even_share,
    farm_net_low_usd: s.econ.net_low_usd,
    farm_hands_on_hours: s.econ.hands_on_hours,
    farm_net_low_per_hour_usd: s.econ.net_low_per_hour_usd,
    farm_verdict: s.econ.verdict,
  }));
}

/**
 * Bootstrap stability: refit the winning size model on BOOTSTRAP_N resamples of the trimmed
 * comparables (seeded RNG — the same seed, the same resamples, every run), recompute every board
 * row's implied value under each refit, and take the 5th–95th percentile range of each row's rank
 * and implied value. The growth tilt is not refitted per resample: it is a small capped multiplier,
 * and the bootstrap measures the size curve's stability, which is where the rank comes from.
 * Returns the per-row ranges plus the board-level summary for the research note.
 */
export function bootstrapBoard(
  snapshot: Snapshot,
  board: BoardRow[],
  fit: FitReport,
  winnerKind: CandidateReport['kind'],
  winnerWithChains: boolean,
): { ranges: Map<string, { rankLow: number; rankHigh: number; impLow: number; impHigh: number }>; summary: BootstrapReport } {
  const trimmed = trimmedComps(compsOf(snapshot));
  const factory =
    winnerKind === 'pooled' ? pooledFactory(winnerWithChains) : winnerKind === 'category' ? categoryFactory(winnerWithChains) : huberFactory(winnerWithChains);
  const rng = mulberry32(BOOTSTRAP_SEED);
  const bySlugBoard = new Map(board.map((r) => [r.slug, r]));
  const protocols = board.map((r) => snapshot.protocols.find((p) => p.slug === r.slug)!);
  const impliedRuns = new Map<string, number[]>();
  const rankRuns = new Map<string, number[]>();
  for (const r of board) {
    impliedRuns.set(r.slug, []);
    rankRuns.set(r.slug, []);
  }
  let used = 0;
  for (let b = 0; b < BOOTSTRAP_N; b++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < trimmed.length; i++) sample.push(trimmed[Math.floor(rng() * trimmed.length)]!);
    const refit = factory(sample);
    if (refit === null) continue;
    used++;
    const scored = protocols.map((p) => {
      const tilt = growthTilt(p, fit);
      return { slug: p.slug, implied: Math.max(1, Math.round(Math.exp(refit.predict(p)) * tilt)) };
    });
    scored.sort((a, c) => c.implied - a.implied || (a.slug < c.slug ? -1 : a.slug > c.slug ? 1 : 0));
    scored.forEach((s, i) => {
      impliedRuns.get(s.slug)!.push(s.implied);
      rankRuns.get(s.slug)!.push(i + 1);
    });
  }
  const ranges = new Map<string, { rankLow: number; rankHigh: number; impLow: number; impHigh: number }>();
  const medianRank = new Map<string, number>();
  for (const r of board) {
    const impSorted = [...impliedRuns.get(r.slug)!].sort((a, b) => a - b);
    const rankSorted = [...rankRuns.get(r.slug)!].sort((a, b) => a - b);
    const rankLo = Math.round(quantileSorted(rankSorted, 0.05) ?? r.rank);
    const rankHi = Math.round(quantileSorted(rankSorted, 0.95) ?? r.rank);
    ranges.set(r.slug, {
      rankLow: rankLo,
      rankHigh: rankHi,
      impLow: Math.round(quantileSorted(impSorted, 0.05) ?? r.implied_value_usd),
      impHigh: Math.round(quantileSorted(impSorted, 0.95) ?? r.implied_value_usd),
    });
    medianRank.set(r.slug, median(rankSorted) ?? r.rank);
  }
  const top20 = board.slice(0, 20);
  const shifts = top20.map((r) => Math.abs((medianRank.get(r.slug) ?? r.rank) - r.rank));
  const widths = top20.map((r) => ranges.get(r.slug)!.rankHigh - ranges.get(r.slug)!.rankLow);
  const summary: BootstrapReport = {
    n: BOOTSTRAP_N,
    seed: BOOTSTRAP_SEED,
    resamples_used: used,
    mean_abs_rank_shift_top20: round4(shifts.reduce((a, b) => a + b, 0) / Math.max(shifts.length, 1)),
    median_rank_width_top20: median(widths) ?? 0,
  };
  return { ranges, summary };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan and the model breakdown the page renders. */
export function radarRow(row: BoardRow, watchlist: string[]): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    watchlist: watchlist.includes(row.slug),
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_tilt: row.model.growth_tilt,
    size_value_usd: row.model.size_value_usd,
    interval_low_usd: row.model.interval_low_usd,
    interval_high_usd: row.model.interval_high_usd,
    curve: row.model.curve,
    curve_weight: row.model.curve_weight,
    boot_rank_low: row.model.boot_rank_low,
    boot_rank_high: row.model.boot_rank_high,
    boot_low_usd: row.model.boot_low_usd,
    boot_high_usd: row.model.boot_high_usd,
    farm_steps: row.farm_steps,
    farm_capital_usd: row.farm_capital_usd,
    farm_gas_usd: row.farm_gas_usd,
    farm_hold_days: row.farm_hold_days,
    farm_total_cost_usd: row.farm_total_cost_usd,
    farm_break_even_share: row.farm_break_even_share,
    farm_net_low_usd: row.farm_net_low_usd,
    farm_hands_on_hours: row.farm_hands_on_hours,
    farm_net_low_per_hour_usd: row.farm_net_low_per_hour_usd,
    farm_verdict: row.farm_verdict,
  };
}

/** Everything the dashboard renders, from the snapshot: the board, the live set, and the fitted model. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData; fit: FitReport } {
  const { fit, model } = fitModel(snapshot);
  const board = buildBoard(snapshot, fit, model);
  const winner = fit.candidates.find((c) => c.name === fit.chosen_model);
  const { ranges, summary } = bootstrapBoard(snapshot, board, fit, fit.chosen_kind, winner?.with_chains ?? false);
  for (const row of board) {
    const range = ranges.get(row.slug);
    if (range !== undefined) {
      row.model.boot_rank_low = range.rankLow;
      row.model.boot_rank_high = range.rankHigh;
      row.model.boot_low_usd = range.impLow;
      row.model.boot_high_usd = range.impHigh;
    }
  }
  fit.bootstrap = summary;
  fit.verdicts = {
    farm: board.filter((r) => r.farm_verdict === 'FARM').length,
    thin: board.filter((r) => r.farm_verdict === 'THIN').length,
    skip: board.filter((r) => r.farm_verdict === 'SKIP').length,
  };
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model_rationale: MODEL_RATIONALE,
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist)),
    live,
  };
  return { board, radar, fit };
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** The fitted model and its validation as one script, written into the dashboard so the judge reads it
 *  with the page's source: the fit is computed at run time from the snapshot, and this is the record of it. */
export function fitScript(fit: FitReport): string {
  return `window.FIT=${JSON.stringify(fit)};\n`;
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}
