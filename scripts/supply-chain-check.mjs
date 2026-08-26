#!/usr/bin/env node
// Supply-chain gate for one npm project (ai-gateway or dailynutry-app).
//
// Self-propagating npm worms (Shai-Hulud and its successors) have shown one
// repeated pattern: a compromised package version lands in a lockfile carrying
// a NEW postinstall/preinstall script it never had before, and that script
// runs immediately on `npm install` — reading tokens, then republishing itself
// through any credential it finds. `.npmrc` already blocks scripts from
// running at all (`ignore-scripts=true`), but a package quietly *gaining* an
// install script is itself the tripwire worth watching for, independent of
// whether that script would have been allowed to run.
//
// Usage: node ../scripts/supply-chain-check.mjs
// Run from inside ai-gateway/ or dailynutry-app/ (cwd = the project root).
//
// Checks, in order:
//   1. Lockfile install-script inventory vs. supply-chain-allowlist.json —
//      hard fail on any package with an install script that isn't allowlisted.
//   2. Release cooldown — hard fail if any DIRECT dependency is locked to a
//      version published more recently than MIN_PACKAGE_AGE_DAYS. A malicious
//      publish is usually caught and pulled within hours to a few days; simply
//      not being first to install a brand-new version shrinks that exposure
//      window for free. Non-fatal on registry/network errors — this must
//      never be the reason CI is flaky.
//   3. npm audit high/critical findings vs. accepted-risk.json — hard fail on
//      any advisory that isn't explicitly accepted, or whose acceptance has
//      expired (see accepted-risk.json for why this exists instead of a flat
//      --audit-level cutoff).
//   4. npm audit signatures — hard fail if registry provenance can't verify.
//
// Exits non-zero on the first failing check so CI stops fast.

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// execSync always goes through a shell, which is what actually resolves the
// `npm`/`npm.cmd` shim on Windows (spawning `npm.cmd` directly, without a
// shell, fails with EINVAL on this platform). Safe here because every
// argument below is a fixed literal — nothing user-supplied is interpolated.
function runNpm(args) {
  execSync(`npm ${args.join(' ')}`, { stdio: 'inherit' });
}

const cwd = process.cwd();
const lockfilePath = `${cwd}/package-lock.json`;
const packageJsonPath = `${cwd}/package.json`;
const allowlistPath = `${cwd}/supply-chain-allowlist.json`;
const acceptedRiskPath = `${cwd}/accepted-risk.json`;
const MIN_PACKAGE_AGE_DAYS = Number(process.env.SUPPLY_CHAIN_MIN_AGE_DAYS ?? 4);

function fail(message) {
  console.error(`\n✗ supply-chain check failed: ${message}\n`);
  process.exit(1);
}

function section(title) {
  console.log(`\n▶ ${title}`);
}

// ── 1. Install-script inventory ────────────────────────────────────────────
section('install-script inventory');

if (!existsSync(lockfilePath)) {
  fail(`no package-lock.json in ${cwd} — run npm install first`);
}
if (!existsSync(allowlistPath)) {
  fail(
    `no supply-chain-allowlist.json in ${cwd}. If this project has no ` +
      `packages with install scripts, create one with: {"allowed": []}`,
  );
}

const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'));
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const allowedSet = new Set(allowlist.allowed ?? []);

const found = new Map(); // "name@version" -> path
for (const [pathKey, meta] of Object.entries(lockfile.packages ?? {})) {
  if (pathKey === '' || !meta.hasInstallScript) continue;
  const name = pathKey.replace(/^.*node_modules\//, '');
  found.set(`${name}@${meta.version}`, pathKey);
}

const unlisted = [...found.keys()].filter((id) => !allowedSet.has(id));

if (unlisted.length > 0) {
  console.error('Packages with install scripts NOT in supply-chain-allowlist.json:');
  for (const id of unlisted) console.error(`  - ${id}  (${found.get(id)})`);
  fail(
    'a dependency gained an install script. Review what the script does ' +
      '(scripts never run here — ignore-scripts=true — but the presence of a ' +
      'new one is the signal). If it is legitimate, add it to ' +
      '"allowed" in supply-chain-allowlist.json with a one-line reason.',
  );
}

const stale = [...allowedSet].filter((id) => !found.has(id));
if (stale.length > 0) {
  console.log('Note: allowlist entries no longer present in the lockfile (safe to remove):');
  for (const id of stale) console.log(`  - ${id}`);
}

console.log(`OK — ${found.size} package(s) with install scripts, all allowlisted.`);

// ── 2. Release cooldown on direct dependencies ─────────────────────────────
section(`release cooldown (direct deps must be ≥ ${MIN_PACKAGE_AGE_DAYS} days old)`);

// Direct dependencies only. Transitives move when a direct one moves, and
// you can't hold them back individually anyway — gating what this project
// deliberately chose to install is the decision that's actually yours.
const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const directNames = [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
];

const lockedVersion = (name) =>
  lockfile.packages?.[`node_modules/${name}`]?.version;

const tooFresh = [];
const uncheckable = [];

for (const name of directNames) {
  const version = lockedVersion(name);
  if (!version) continue;

  let publishedAt;
  try {
    // The `time` document on the packument carries a publish timestamp per
    // version. `--json` keeps npm from pretty-printing this into prose.
    const raw = execSync(`npm view ${name}@${version} time --json`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(raw);
    publishedAt = typeof parsed === 'string' ? parsed : parsed?.[version];
  } catch {
    uncheckable.push(`${name}@${version}`);
    continue;
  }

  if (!publishedAt) {
    uncheckable.push(`${name}@${version}`);
    continue;
  }

  const ageDays = (Date.now() - Date.parse(publishedAt)) / 86_400_000;
  if (ageDays < MIN_PACKAGE_AGE_DAYS) {
    tooFresh.push({ id: `${name}@${version}`, ageDays, publishedAt });
  }
}

if (uncheckable.length > 0) {
  // Registry hiccups and private/unpublished packages both land here. Worth
  // printing, never worth failing the build over.
  console.log(`Could not check publish date for ${uncheckable.length} package(s): ${uncheckable.join(', ')}`);
}

if (tooFresh.length > 0) {
  console.error('Direct dependencies pinned to a very recently published version:');
  for (const p of tooFresh) {
    console.error(`  - ${p.id}  published ${p.ageDays.toFixed(1)} day(s) ago (${p.publishedAt})`);
  }
  fail(
    `a compromised publish is usually caught within days, so this project waits ` +
      `${MIN_PACKAGE_AGE_DAYS} days before adopting a new version. Pin to the ` +
      `previous release, or — if you have a specific reason to take it now ` +
      `(a security fix you need) — run once with ` +
      `SUPPLY_CHAIN_MIN_AGE_DAYS=0 and say why in the commit message.`,
  );
}

console.log(`OK — ${directNames.length} direct dependencies, none newer than ${MIN_PACKAGE_AGE_DAYS} days.`);

// ── 3. npm audit (high/critical) vs. a dated exception list ───────────────
section('npm audit — high/critical findings');

let acceptedRisk = { accepted: [] };
if (existsSync(acceptedRiskPath)) {
  acceptedRisk = JSON.parse(readFileSync(acceptedRiskPath, 'utf8'));
}
const today = new Date().toISOString().slice(0, 10);
const acceptedById = new Map();
for (const entry of acceptedRisk.accepted ?? []) {
  if (entry.reviewBy < today) {
    fail(
      `accepted-risk.json entry ${entry.id} (${entry.package}) expired on ` +
        `${entry.reviewBy}. Re-run npm audit, confirm it's still out of reach ` +
        `of the shipped bundle, and bump reviewBy — or fix it for real.`,
    );
  }
  acceptedById.set(entry.id, entry);
}

let auditJson;
try {
  // npm audit exits non-zero whenever it finds anything — that's expected
  // here, we parse the JSON regardless and decide pass/fail ourselves.
  auditJson = execSync('npm audit --json', { encoding: 'utf8' });
} catch (err) {
  auditJson = err.stdout;
}
const report = JSON.parse(auditJson);

// `via` entries are either advisory objects (this package is the root cause)
// or plain strings naming another vulnerable package (this package only
// inherits the problem). Only the objects are root causes worth listing —
// the string ones resolve once their named package is fixed or accepted.
const rootFindings = [];
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== 'object' || !via.url) continue;
    if (via.severity !== 'high' && via.severity !== 'critical') continue;
    const id = via.url.slice(via.url.lastIndexOf('/') + 1);
    rootFindings.push({ id, package: vuln.name, severity: via.severity });
  }
}

const unaccepted = rootFindings.filter((f) => !acceptedById.has(f.id));

if (unaccepted.length > 0) {
  console.error('High/critical advisories not in accepted-risk.json:');
  for (const f of unaccepted) {
    console.error(`  - ${f.id}  ${f.package}  (${f.severity})  ${f.id.replace('GHSA', 'https://github.com/advisories/GHSA')}`);
  }
  fail('run `npm audit fix`, or add a dated, justified entry to accepted-risk.json.');
}

if (rootFindings.length > 0) {
  console.log(`${rootFindings.length} high/critical finding(s), all accepted:`);
  for (const f of rootFindings) {
    const entry = acceptedById.get(f.id);
    console.log(`  - ${f.id}  ${f.package}  — ${entry.reason} (review by ${entry.reviewBy})`);
  }
} else {
  console.log('OK — no high/critical vulnerabilities.');
}

// ── 4. Registry signature / provenance verification ────────────────────────
section('npm audit signatures');
try {
  runNpm(['audit', 'signatures']);
  console.log('OK — all packages verified against registry signatures.');
} catch {
  fail(
    'npm could not verify registry signatures for one or more packages. ' +
      'This can mean a package was published without provenance, or (worse) ' +
      'was tampered with after publish. Investigate before installing.',
  );
}

console.log('\n✓ supply-chain check passed.\n');
