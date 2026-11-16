// token-radar-01: the entry's driver (Node 22, standard library only).
//
// It reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), fits the radar-3.0
// model to the snapshot's own comparables in lib/model.ts, and writes the ranked board to
// /output/board.json plus the dashboard's data to /output/data.js and the fit's record to
// /output/dashboard/fit.js — the fit is computed at run time, and fit.js is how the judge reads it
// with the page's source. It then copies this repository's dashboard/ and screenshots/ into /output,
// and writes /output/dossier.json last — the summary the judge reads — with the vendored make.fun
// library, which rebuilds the dossier from /output and compares bytes, so the files above must
// already be final when it runs.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read /output/data.js, the same board this program
// writes. The driver refuses a board the gate would refuse (boardIssue), a dashboard without
// its index.html, and screenshots that are not three well-named images under the size cap,
// before the dossier is built, so a failure here names the file at fault instead of failing
// inside the dossier step.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, fitScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_MAX = 4;
const SCREENSHOT_MAX_BYTES = 524_288;
const DASHBOARD_MAX_FILES = 400;
const DASHBOARD_MAX_BYTES = 4_194_304;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Stop with a message on stderr and a non-zero exit. */
function fail(message: string, code = 1): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/** --name <value> or --name=<value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const at = process.argv.indexOf(flag);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`${flag}=`));
  return joined === undefined ? fallback : joined.slice(flag.length + 1);
}

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

function main(): void {
  const inputArg = arg('input', '/input');
  const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputFile)) {
    fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
  }
  const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar, fit } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  const dashboard = copyFiles(join(REPO_ROOT, 'dashboard'), join(out, 'dashboard'));
  if (!dashboard.includes('index.html')) {
    fail(`dashboard/ has no index.html to serve (copied ${dashboard.length} file${dashboard.length === 1 ? '' : 's'})`);
  }
  // The fit's record is written into the dashboard itself, before the dossier is built, so the judge
  // reads the fitted curve and its validation with the page's source.
  writeFileSync(join(out, 'dashboard', 'fit.js'), fitScript(fit));

  const shots = copyFiles(join(REPO_ROOT, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3) {
    fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
  }
  if (shots.length > SCREENSHOT_MAX) {
    fail(`screenshots/ holds ${shots.length} images: hand in at most ${SCREENSHOT_MAX}`);
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
    }
    const bytes = statSync(join(out, 'screenshots', name)).size;
    if (bytes > SCREENSHOT_MAX_BYTES) {
      fail(`screenshots/${name} is ${bytes} bytes: keep each screenshot under ${SCREENSHOT_MAX_BYTES} bytes`);
    }
  }

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      text_max_bytes: TEXT_MAX_BYTES,
      screenshots: { max: SCREENSHOT_MAX, max_bytes: SCREENSHOT_MAX_BYTES },
      dashboard: { max_files: DASHBOARD_MAX_FILES, max_bytes: DASHBOARD_MAX_BYTES },
    }),
  );

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: fit on ${fit.comps_fitted} comps (of ${fit.comps_total} with a token; ${fit.comps_zero_mcap} zero market cap, ${fit.comps_trimmed} trimmed): log mcap = ${fit.size_intercept} + ${fit.size_slope} x log TVL, in-sample R2 ${fit.r2_in}, time-split R2 ${fit.time_r2}, median APE ${fit.time_med_ape}\n` +
      `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashboard.length + 1} files, incl. fit.js), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
  );
}

main();
