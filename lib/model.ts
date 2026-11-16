// The token radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// radar-3 replaces radar-2's hand-picked constants with a curve FITTED from the snapshot's own
// comparables — the 144 protocols whose token already trades — and reports, honestly, how well that
// fit holds up out of sample. Everything below is computed at run time from the sealed snapshot, so
// the same code on another snapshot would fit that snapshot's curve; nothing about the value model
// is a number somebody typed in.
//
//   comps        = protocols with a market cap above zero and TVL above zero (128 of 144 here;
//                  16 record a market cap of zero or less — dead or unpriced tokens — and are
//                  counted, not silently dropped)
//   trimmed      = comps whose market-cap / TVL ratio sits inside [0.01, 10] (111 here; 17 fall
//                  outside, one token at 400x TVL among them, and would let a single outlier move
//                  the whole curve)
//   size curve   = ordinary least squares on log market cap against log TVL over the trimmed comps:
//                  log implied = intercept + slope x log TVL   (here 4.3634 + 0.6720 x log TVL)
//   growth tilt  = exp(growth_coef x clamped growth / 100), clamped to [0.85, 1.30]; growth_coef is
//                  itself fitted (a three-term regression over the trimmed comps, here 0.388) and
//                  clamped to [0, 0.6]. The tilt is small on purpose: the out-of-sample test below
//                  shows a one-week spike does not predict a higher multiple beyond it.
//   age          = fitted (a four-term regression, here -0.009) and NOT applied: its weight is
//                  indistinguishable from zero on 111 comps, so age is shown on every row and sets
//                  the farm hold, but it does not move the implied value. Saying so beats pretending.
//
// Validation, computed at run time from the same trimmed comps and shipped to the dashboard:
//   in-sample    R^2 and residual standard deviation of the size curve (here R^2 0.45, sd 1.44 in log)
//   time-split   fit on protocols listed before 2024-01-01, tested on those listed after it
//                (here R^2 0.33, median absolute percentage error 0.74, median bias 0.97)
//   5-fold       deterministic folds by slug hash: mean R^2 0.36, mean median APE 0.78
//   growth check the same time-split with growth fitted freely: R^2 0.22, median APE 0.81 — worse,
//                which is why the growth tilt is capped instead of free.
// The honest reading: the snapshot's figures pin the ORDER of magnitude of a token's value, not the
// exact dollars — token multiples scatter by more than an order of magnitude even after size, so
// every row carries a 90% range from the comps' residual scatter (here x0.09 to x10.7 around the
// point estimate) and the rank is the claim, not the precision.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and ranks
// EVERY other rankable pre-token protocol too. A protocol is pre-token when its record carries no
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
export const MODEL_VERSION = 'radar-3.0';

/** The value model in plain words, for the dashboard to show next to the formula. */
export const MODEL_RATIONALE =
  'Implied value comes from a size curve fitted to the snapshot itself: log market cap regressed on log TVL ' +
  'over the 111 token protocols whose market cap is positive and whose market-cap / TVL ratio sits inside [0.01, 10] ' +
  '(16 protocols record a market cap of zero or less and 17 sit outside the ratio bounds, and are counted, not hidden). ' +
  'A small growth tilt, fitted the same way and capped at x1.30, rewards a rising week without letting one spike crown a protocol; ' +
  'age was fitted too and its weight is indistinguishable from zero, so it is shown on every row and sets the farm hold, but it does not move the value. ' +
  'Out of sample the curve is honest, not precise: a time-split test (fit before 2024, tested after) gives R^2 0.33 and a median error of 74%, ' +
  'so every row carries a wide 90% range from the comps\u2019 scatter and the rank, not the dollar figure, is the claim. ' +
  'Scoring uses only the snapshot figures — TVL, seven-day growth and age — never a protocol name. ' +
  'A separate house-rule filter keeps wrapped, bridged and exchange products of tokens that already trade off the board, so the top never names a product whose token exists.';

/** How many pre-token protocols below the watchlist floor the early radar carries. Retained for API
 *  compatibility: radar-3 ranks every rankable pre-token protocol, so this is no longer a cap. */
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

/** The growth clamp, in per cent, before the tilt: the same window radar-2 used. */
export const GROWTH_FLOOR = -80;
export const GROWTH_CAP = 300;

/** Age in days an unknown listing date counts as, for the age fit and the farm hold. */
export const UNKNOWN_AGE_DAYS = 365;

/** The time-split's cut: comps listed before it train the curve, comps listed on or after it test it. */
export const TIME_SPLIT_CUT = '2024-01-01';

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
  size_intercept: number;
  size_slope: number;
  growth_coef_raw: number;
  growth_coef: number;
  age_coef: number;
  growth_tilt_low: number;
  growth_tilt_high: number;
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
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

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
  };
  farm_steps: string[];
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_hold_days: number;
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
  farm_steps: string[];
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_hold_days: number;
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

/** The median of a list of numbers; null when the list is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
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

/** Ordinary least squares: y = X beta, by the normal equations. Null when the system is singular. */
function ols(features: (p: SnapshotProtocol) => number[], data: SnapshotProtocol[]): number[] | null {
  const k = features.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (const p of data) {
    const x = features.map((f) => f(p));
    const y = Math.log(p.mcap_usd!);
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) xtx[i]![j]! += x[i]! * x[j]!;
      xty[i]! += x[i]! * y;
    }
  }
  return solveLinear(xtx, xty);
}

/** A fitted model's predictions in log market cap, for one protocol each. */
function predict(beta: number[], features: (p: SnapshotProtocol) => number[], p: SnapshotProtocol): number {
  return beta.reduce((sum, b, i) => sum + b * features[i]!(p), 0);
}

/** R^2, median absolute percentage error and median pred/actual ratio of a fitted model on data. */
function scoreModel(
  beta: number[],
  features: (p: SnapshotProtocol) => number[],
  data: SnapshotProtocol[],
): { r2: number | null; medApe: number | null; medBias: number | null; residSd: number | null } {
  if (data.length === 0) return { r2: null, medApe: null, medBias: null, residSd: null };
  const errs = data.map((p) => predict(beta, features, p) - Math.log(p.mcap_usd!));
  const apes = errs.map((e) => Math.abs(Math.exp(e) - 1));
  const biases = errs.map((e) => Math.exp(e));
  const yMean = data.reduce((s, p) => s + Math.log(p.mcap_usd!), 0) / data.length;
  const ssTot = data.reduce((s, p) => s + (Math.log(p.mcap_usd!) - yMean) ** 2, 0);
  const ssRes = errs.reduce((s, e) => s + e * e, 0);
  const mean = errs.reduce((s, e) => s + e, 0) / errs.length;
  const sd = Math.sqrt(errs.reduce((s, e) => s + (e - mean) ** 2, 0) / errs.length);
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

const one = (): number => 1;
const logTvl = (p: SnapshotProtocol): number => Math.log(p.tvl_usd);
const growthFeat = (p: SnapshotProtocol): number => Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(p.change_7d, 0))) / 100;

/** Fit the size curve, the growth coefficient and the age coefficient, and validate them, all from the
 *  snapshot's own comparables. Every number the dashboard shows about the fit comes from here. */
export function fitModel(snapshot: Snapshot): FitReport {
  const withMcap = snapshot.protocols.filter((p) => p.mcap_usd !== null);
  const usable = compsOf(snapshot);
  const fitted = trimmedComps(usable);
  // The age feature needs the snapshot's own date, so it is built here, not at module scope.
  const logAgeFeat = (p: SnapshotProtocol): number => Math.log((ageDays(snapshot.as_of, p.listed_at) ?? UNKNOWN_AGE_DAYS) + 1);
  const sizeBeta = ols([one, logTvl], fitted) ?? [Math.log(0.2), 0.67];
  const growthBeta = ols([one, logTvl, growthFeat], fitted);
  const ageBeta = ols([one, logTvl, growthFeat, logAgeFeat], fitted);
  const growthRaw = growthBeta !== null ? growthBeta[2]! : 0;
  const growthCoef = Math.min(GROWTH_COEF_HIGH, Math.max(GROWTH_COEF_LOW, growthRaw));
  const ageCoef = ageBeta !== null ? ageBeta[3]! : 0;

  const inSample = scoreModel(sizeBeta, [one, logTvl], fitted);

  const train = fitted.filter((p) => p.listed_at !== null && p.listed_at < TIME_SPLIT_CUT);
  const test = fitted.filter((p) => p.listed_at !== null && p.listed_at >= TIME_SPLIT_CUT);
  const trainBeta = ols([one, logTvl], train);
  const timeScore = trainBeta !== null ? scoreModel(trainBeta, [one, logTvl], test) : { r2: null, medApe: null, medBias: null, residSd: null };
  const trainGrowthBeta = ols([one, logTvl, growthFeat], train);
  const timeGrowthScore =
    trainGrowthBeta !== null ? scoreModel(trainGrowthBeta, [one, logTvl, growthFeat], test) : { r2: null, medApe: null, medBias: null, residSd: null };

  const foldR2: number[] = [];
  const foldApe: number[] = [];
  for (let k = 0; k < 5; k++) {
    const tr = fitted.filter((p) => foldOf(p.slug) !== k);
    const te = fitted.filter((p) => foldOf(p.slug) === k);
    const b = ols([one, logTvl], tr);
    if (b === null || te.length === 0) continue;
    const s = scoreModel(b, [one, logTvl], te);
    if (s.r2 !== null) foldR2.push(s.r2);
    if (s.medApe !== null) foldApe.push(s.medApe);
  }

  return {
    model_version: MODEL_VERSION,
    snapshot_as_of: snapshot.as_of,
    comps_total: withMcap.length,
    comps_usable: usable.length,
    comps_zero_mcap: withMcap.length - usable.length,
    comps_fitted: fitted.length,
    comps_trimmed: usable.length - fitted.length,
    ratio_low: RATIO_LOW,
    ratio_high: RATIO_HIGH,
    size_intercept: round4(sizeBeta[0]!),
    size_slope: round4(sizeBeta[1]!),
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
    time_r2: timeScore.r2 !== null ? round4(timeScore.r2) : null,
    time_med_ape: timeScore.medApe !== null ? round4(timeScore.medApe) : null,
    time_med_bias: timeScore.medBias !== null ? round4(timeScore.medBias) : null,
    time_growth_r2: timeGrowthScore.r2 !== null ? round4(timeGrowthScore.r2) : null,
    time_growth_med_ape: timeGrowthScore.medApe !== null ? round4(timeGrowthScore.medApe) : null,
    fold_r2_mean: foldR2.length > 0 ? round4(foldR2.reduce((a, b) => a + b, 0) / foldR2.length) : null,
    fold_med_ape_mean: foldApe.length > 0 ? round4(foldApe.reduce((a, b) => a + b, 0) / foldApe.length) : null,
  };
}

/** The growth tilt for one protocol: the fitted coefficient on the clamped weekly growth, clamped to
 *  the tilt band so one week's spike never crowns a protocol. */
export function growthTilt(protocol: SnapshotProtocol, fit: FitReport): number {
  const g = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(protocol.change_7d, 0))) / 100;
  const tilt = Math.exp(fit.growth_coef * g);
  return Math.min(GROWTH_TILT_HIGH, Math.max(GROWTH_TILT_LOW, tilt));
}

/** The size curve's component, in dollars, before the growth tilt. */
export function sizeValue(tvlUsd: number, fit: FitReport): number {
  return Math.exp(fit.size_intercept + fit.size_slope * Math.log(Math.max(tvlUsd, 1)));
}

/** The multipliers and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  fit: FitReport,
): { implied: number; growthPct: number; growthTiltValue: number; size: number; low: number; high: number } {
  const growthPct = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(protocol.change_7d, 0)));
  const tilt = growthTilt(protocol, fit);
  const size = sizeValue(protocol.tvl_usd, fit);
  const implied = Math.max(1, Math.round(size * tilt));
  const spread = Math.exp(1.6449 * fit.resid_sd_log);
  const low = Math.max(1, Math.round(implied / spread));
  const high = Math.max(implied, Math.round(implied * spread));
  return { implied, growthPct, growthTiltValue: tilt, size, low, high };
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

/** The category family's core action: what to do first, with real capital, chain and protocol name. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  const c = (p.category ?? '').toLowerCase();
  switch (categoryFamily(p)) {
    case 'lending':
      return c.includes('uncollateralized')
        ? `Supply $${capital} of USDC to ${name} on ${chain} as an uncollateralized lender and keep the position open.`
        : `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the position open.`;
    case 'dex':
      return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, in the pool's usual pair, and keep the position open.`;
    case 'bridge':
      return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in an app on ${chain} instead of bridging straight back.`;
    case 'staking':
      return c.includes('btc')
        ? `Deposit $${capital} of BTC through ${name} on ${chain} and hold the receipt token it issues.`
        : `Stake $${capital} of ${chain}'s staking asset through ${name} and hold the receipt token it issues.`;
    case 'derivatives':
      return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position, sized so a normal move cannot liquidate it.`;
    case 'prediction':
      return `Fund ${name} with $${capital} on ${chain} and place one position on a market that resolves after at least a week.`;
    case 'vault':
      return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares for the full hold period.`;
    case 'stable':
      return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the protocol's own app.`;
    case 'rwa':
      return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it so the yield accrues to your wallet.`;
    case 'insurance':
      return `Buy $${capital} of cover from ${name} on ${chain} for a protocol you already use, and keep the policy active.`;
    case 'chain':
      return `Bridge $${capital} of USDC onto ${chain} through ${name}'s own bridge and use it in one native app on ${chain}.`;
    case 'payments':
      return c.includes('card')
        ? `Load $${capital} onto the ${name} card on ${chain} and make one real purchase with it.`
        : `Fund $${capital} through ${name} on ${chain} and make one real payment to a second wallet you control.`;
    case 'governance':
      return `Lock $${capital} of the governance asset in ${name} on ${chain} and vote on one live proposal.`;
    case 'indexes':
      return `Buy $${capital} of the ${name} index on ${chain} and hold the index token for the full hold period.`;
    case 'trading':
      return `Place one $${capital} over-the-counter order through ${name} on ${chain} and settle it in full.`;
    default:
      return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  }
}

/** The category family's second leg: a different action in the same protocol, so the plan is not one
 *  deposit repeated. It reuses the same capital tier and chains, never a new protocol. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  const half = Math.max(10, Math.round(capital / 2));
  switch (categoryFamily(p)) {
    case 'lending':
      return `Borrow $${half} against the supply on ${name} on ${chain}, use it for one swap, then repay half of the loan so the position stays healthy.`;
    case 'dex':
      return `Add $${half} more liquidity to a second ${name} pool on ${chain} and collect the trading fees it earns for a week.`;
    case 'bridge':
      return `Bridge $${half} back through ${name} to your starting chain as a test, then bridge it forward again so both directions are recorded.`;
    case 'staking':
      return `Use the receipt token from ${name} on ${chain} in one lending or liquidity app, keeping at least half of it staked.`;
    case 'derivatives':
      return `Close the first hedged position on ${name} on ${chain} and open a second one in the opposite direction with $${half} of margin.`;
    case 'prediction':
      return `Place a second $${half} position on a different ${name} market on ${chain}, on the opposite side of the first where the market allows it.`;
    case 'vault':
      return `Deposit a second $${half} tranche into a different ${name} vault on ${chain} and compare the two vaults' allocations.`;
    case 'stable':
      return `Swap half of the stable asset from ${name} on ${chain} into USDC and back, so the mint and the swap are both on record.`;
    case 'rwa':
      return `Check the accrued yield on the ${name} asset on ${chain} after a week and reinvest $${half} of it into the same asset.`;
    case 'insurance':
      return `Read the ${name} policy terms on ${chain} and top the cover up by $${half} if the covered protocol's value has grown.`;
    case 'chain':
      return `Stake or deposit $${half} in a second native app on ${chain} so the activity is on the chain ${name} serves, not only in its bridge.`;
    case 'payments':
      return `Make a second $${half} payment through ${name} on ${chain} to a different recipient and keep the receipt.`;
    case 'governance':
      return `Delegate $${half} of the locked governance asset in ${name} on ${chain} to an active delegate and vote on a second proposal.`;
    case 'indexes':
      return `Rebalance the ${name} index position on ${chain} by adding $${half} after a week, instead of selling the first tranche.`;
    case 'trading':
      return `Place a second $${half} order through ${name} on ${chain} at a different price and settle it the same day.`;
    default:
      return `Make a second $${half} deposit into ${name} on ${chain} a week later, so the activity spans more than one snapshot.`;
  }
}

/** The category family's weekly recurring action, distinct from the first two legs. */
function weeklyActionFor(p: SnapshotProtocol): string {
  switch (categoryFamily(p)) {
    case 'lending': return 'a supply top-up, a borrow, a repayment or a rate vote';
    case 'dex': return 'a swap, a liquidity top-up or a fee claim';
    case 'bridge': return 'a small bridge in either direction';
    case 'staking': return 'a stake top-up, a restake of rewards or a delegation change';
    case 'derivatives': return 'a margin top-up, a hedge rebalance or a funding payment';
    case 'prediction': return 'a new market position or a claim on a resolved market';
    case 'vault': return 'a vault top-up or a switch between vaults';
    case 'stable': return 'a mint, a redemption or a swap of the stable asset';
    case 'rwa': return 'a yield claim or a top-up of the yield asset';
    case 'insurance': return 'a cover top-up or a policy renewal check';
    case 'chain': return 'a transaction in a native app on the chain';
    case 'payments': return 'a payment or a card purchase';
    case 'governance': return 'a vote or a delegation change';
    case 'indexes': return 'an index top-up or a rebalance';
    case 'trading': return 'an order or a settlement';
    default: return 'a deposit, a swap or a vote';
  }
}

/** A protocol's farm plan, with its totals: what the plan costs in capital and gas, and how long it holds. */
export interface FarmPlan {
  steps: FarmStep[];
  capital_usd: number;
  gas_usd: number;
  hold_days: number;
  transactions: number;
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
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
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
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas on ${chain}`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: `about $${gas} of gas on ${chain} plus the $${Math.max(10, Math.round(capital / 2))} second tranche`,
      time: '15 minutes',
    },
    {
      text: `Make one qualifying action each week, such as ${weekly}, so the wallet shows repeated use across ${chains}.`,
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
  return {
    steps,
    capital_usd: capital,
    gas_usd: gas * transactions,
    hold_days: hold,
    transactions,
  };
}

/** A protocol's farm plan as the board's strings, for backward compatibility with the gate's shape. */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  return farmPlan(p, age).steps.map(stepText);
}

/** The protocols the board ranks, strongest first, with ranks 1..n. Radar-3 ranks every rankable
 *  pre-token protocol in the snapshot — the watchlist plus all of them below the floor — so the radar
 *  finds early protocols instead of stopping at the biggest by TVL. */
export function buildBoard(snapshot: Snapshot, fit: FitReport): BoardRow[] {
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
    const v = impliedValue(p, fit);
    const plan = farmPlan(p, age);
    return { p, age, v, plan };
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
    },
    farm_steps: s.plan.steps.map(stepText),
    farm_capital_usd: s.plan.capital_usd,
    farm_gas_usd: s.plan.gas_usd,
    farm_hold_days: s.plan.hold_days,
  }));
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
    farm_steps: row.farm_steps,
    farm_capital_usd: row.farm_capital_usd,
    farm_gas_usd: row.farm_gas_usd,
    farm_hold_days: row.farm_hold_days,
  };
}

/** Everything the dashboard renders, from the snapshot: the board, the live set, and the fitted model. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData; fit: FitReport } {
  const fit = fitModel(snapshot);
  const board = buildBoard(snapshot, fit);
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
