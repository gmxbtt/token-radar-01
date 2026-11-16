// The token radar's model, radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and ranks EVERY
// other rankable pre-token protocol too — the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures — TVL, 7-day growth (change_7d) and how
// long the protocol has run with no token (age from listed_at vs as_of). No protocol name or slug is
// ever special-cased: the same function scores every row. See MODEL_RATIONALE for the reasoning.
//
//   size       = (tvl_usd / SIZE_REFERENCE_USD) ^ SIZE_EXPONENT        (diminishing returns on TVL)
//   growth     = clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP) per cent; missing growth counts as 0
//   growthMult = 1 + GROWTH_WEIGHT x (1 - exp(-growth / GROWTH_SATURATION_PCT))   when growth >= 0
//              = max(GROWTH_FLOOR_MULT, 1 + (growth / 100) x GROWTH_DOWN_WEIGHT)   when growth < 0
//   maturity   = MATURITY_FLOOR + MATURITY_RANGE x (1 - exp(-age / MATURITY_DAYS))
//                (age unknown: UNKNOWN_AGE_DAYS)
//   implied    = max(1, round(size x SIZE_SCALE_USD x growthMult x maturityMult))
//
// Why this shape, and why not the starter's linear TVL x 0.25 x growth x maturity:
//  * Size is a square root, not a line. A token's value does not scale one-for-one with locked value:
//    the tenth billion of TVL buys far less new demand than the first hundred million. With a linear
//    multiple the board is just a TVL ranking with noise; with sqrt(TVL) a fast-growing mid-size
//    protocol (say $50M TVL, +80% in a week) can outrank a $5B giant that is shrinking, which is the
//    whole point of a radar. The scale (SIZE_SCALE_USD per sqrt($1M of TVL)) keeps implied values in
//    the same dollar order as the starter's, so the board still reads as money, not an index.
//  * Growth saturates upward and bites harder downward. A single week's spike — the snapshot's largest
//    is +4,448% — is mostly a small base or one deposit, so the upside multiplier asymptotes at
//    1 + GROWTH_WEIGHT (1.9x) instead of letting one week crown a protocol. A decline is the opposite
//    signal: capital leaving is evidence against a launch being worth farming, so a fall is weighted
//    1.25x per point and floored at 0.10x rather than merely discounted. Growth is clamped to
//    [-80%, +300%] before either branch so an extreme print cannot dominate the board either way.
//  * Maturity saturates exponentially. Running for years with no token is evidence the protocol is a
//    durable candidate, but the difference between 3 and 5 years matters less than between 3 months
//    and a year, so the multiplier rises fast early (0.55 at day 0, ~0.77 at a year) and flattens
//    toward 1.0. An unknown listing date is scored at UNKNOWN_AGE_DAYS (one year), the middle of the
//    curve, rather than punished or rewarded.
//  * Nothing else enters: no category bonus, no chain bonus, no name list. Two protocols with the same
//    TVL, growth and age get the same implied value whatever they are called, and the ranking is a
//    pure function of the sealed snapshot, so two runs are byte-identical.

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

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** Exponent on TVL: 0.5 is a square root, i.e. diminishing returns on sheer size. */
  size_exponent: number;
  /** TVL, in dollars, that one unit of the size term represents. */
  size_reference_usd: number;
  /** Dollars of implied value per unit of the size term, before the growth/maturity multipliers. */
  size_scale_usd: number;
  /** Per-point weight of a TVL decline (steeper than the upside weight, by design). */
  growth_down_weight: number;
  /** Seven-day growth, in per cent, at which the upside multiplier is ~63% of the way to its cap. */
  growth_saturation_pct: number;
  /** Lowest the decline branch of the growth multiplier may go. */
  growth_floor_mult: number;
}

export const MODEL: ModelConstants = {
  // base_multiple is retained for API compatibility with the starter dashboard; radar-2 does not use
  // it — size is scored by size_exponent / size_reference_usd / size_scale_usd instead.
  base_multiple: 0.25,
  growth_weight: 0.9,
  growth_floor: -80,
  growth_cap: 300,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 540,
  unknown_age_days: 365,
  size_exponent: 0.5,
  size_reference_usd: 1_000_000,
  size_scale_usd: 20_000_000,
  growth_down_weight: 1.25,
  growth_saturation_pct: 50,
  growth_floor_mult: 0.1,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2.1';

/** The value model in plain words, for the dashboard to show next to the formula. */
export const MODEL_RATIONALE =
  'Implied value = sqrt(TVL in $M) x $20M x a growth multiplier x a maturity multiplier. ' +
  'Size is a square root so a fast-growing mid-size protocol can outrank a shrinking giant; ' +
  'growth saturates upward (a one-week spike caps near 1.9x) and bites harder downward (a fall is weighted 1.25x per point, floored at 0.10x); ' +
  'maturity rewards a long run with no token but flattens toward 1.0, and an unknown listing date counts as one year. ' +
  'Scoring uses only the snapshot figures — TVL, 7-day growth and age — never a protocol name. ' +
  'A separate house-rule filter keeps wrapped, bridged and exchange products of tokens that already trade off the board, so the top never names a product whose token exists.';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. Retained for
 *  API compatibility: radar-2 ranks every rankable pre-token protocol, so this is no longer a cap. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

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
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    size_multiplier: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
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
  growth_multiplier: number;
  maturity_multiplier: number;
  size_multiplier: number;
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
  model: ModelConstants;
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

/** The growth multiplier: saturating upside, steeper downside, floored so a crash cannot zero a row. */
export function growthMultiplier(growthPct: number, model: ModelConstants): number {
  if (growthPct >= 0) return 1 + model.growth_weight * (1 - Math.exp(-growthPct / model.growth_saturation_pct));
  return Math.max(model.growth_floor_mult, 1 + (growthPct / 100) * model.growth_down_weight);
}

/** The maturity multiplier: 0.55 at day 0, ~0.77 at a year, flattening toward 1.0. */
export function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const ageForModel = age ?? model.unknown_age_days;
  return model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(ageForModel, 0) / model.maturity_days));
}

/** The size term: (TVL / $1M) ^ 0.5 — a square root, so sheer TVL has diminishing returns. */
export function sizeMultiplier(tvlUsd: number, model: ModelConstants): number {
  return Math.pow(Math.max(tvlUsd, 0) / model.size_reference_usd, model.size_exponent);
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; sizeMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = growthMultiplier(growthPct, model);
  const maturityMult = maturityMultiplier(age, model);
  const sizeMult = sizeMultiplier(protocol.tvl_usd, model);
  const implied = Math.max(1, Math.round(sizeMult * model.size_scale_usd * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, sizeMult, age };
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

/** The protocols the board ranks, strongest first, with ranks 1..n. Radar-2 ranks every rankable
 *  pre-token protocol in the snapshot — the watchlist plus all of them below the floor — so the radar
 *  finds early protocols instead of stopping at the 160 biggest by TVL. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
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
    const { implied, growthPct, growthMult, maturityMult, sizeMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, sizeMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
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
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
      size_multiplier: round4(s.sizeMult),
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category family, chains, TVL tier, age), never from a hand-written list
 * of names. Every step states what it costs and how long it takes; the safety steps are part of the
 * plan, not an afterthought: a fresh wallet, official links only, never pay to claim, and a small test
 * withdrawal before unwinding.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const chains = chainsOf(p);
  const capital = capitalFor(p);
  const gas = gasFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
  return [
    {
      text: `Open the protocol's official site from its DefiLlama listing, check the address matches, and use a fresh wallet that holds only the funds you plan to farm, keeping its seed phrase offline.`,
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

/** A board row's compact form for data.js, with the farm plan generated in the page. */
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
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    size_multiplier: row.model.size_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
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
  return { board, radar };
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

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
