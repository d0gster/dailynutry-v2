# Security policy

## Reporting a vulnerability

Please email **dev.danilomonteiro@gmail.com** with details and, if possible,
steps to reproduce. Do not open a public issue for anything that could be
exploited before a fix ships. You'll get an acknowledgement within a few days.

## Supply-chain hardening

This is a two-project npm monorepo (`ai-gateway/`, `dailynutry-app/`), and npm
has an active worm problem: compromised package versions that run a
postinstall script the moment they're installed, then republish themselves
through whatever credential they find. The defenses below target that
pattern specifically, not vulnerabilities in general.

**`.npmrc` (both projects)**
- `ignore-scripts=true` — dependency lifecycle scripts (preinstall/install/
  postinstall) never run. This is the single highest-value line here: a
  malicious package has to be *imported and called* to do anything, instead
  of firing automatically on `npm install`.
  - Expo/React Native caveat: if a native build needs one package's install
    step, run it explicitly with `npm rebuild <package>` rather than removing
    this line — that keeps the exception scoped to one package instead of
    reopening the door for the whole tree.
- `save-exact=true` — dependencies are pinned to exact versions, not caret
  ranges. A range would silently accept a compromised patch release; an exact
  pin requires a deliberate `npm install <pkg>@<version>` to move at all.
- `audit-level=high` / `fund=false` — noise reduction, not a security control.

**`scripts/supply-chain-check.mjs`** (run as `npm run supply-chain` in either
project, and in CI on every push/PR via `.github/workflows/ci.yml`):

1. **Install-script inventory vs. `supply-chain-allowlist.json`.** Every
   package in the lockfile that carries an install script must already be
   listed there. `ignore-scripts=true` means none of them actually run, but a
   dependency *quietly gaining* an install script it never had is itself the
   signal worth catching — it shows up as a diff against the allowlist instead
   of disappearing into a 1000-package lockfile.
2. **Release cooldown — direct dependencies must be at least 4 days old.**
   A malicious publish is typically detected, reported and unpublished within
   hours to a few days. Not being among the first to install a brand-new
   version costs nothing and removes most of that exposure window. Only direct
   dependencies are gated: transitives move when a direct one moves, and can't
   be held back individually anyway. Registry/network failures print a note
   but never fail the build.
3. **`npm audit` (high/critical) vs. `accepted-risk.json`.** Any high/critical
   finding must either be fixed or explicitly accepted with a reason and a
   `reviewBy` date — the check hard-fails once that date passes, so an
   exception can't quietly become permanent. (`dailynutry-app/accepted-risk.json`
   currently accepts a handful of Metro/Expo-CLI build-tooling advisories that
   run only on the dev/CI machine, never inside the shipped app bundle — see
   that file for the per-advisory reasoning.)
4. **`npm audit signatures`.** Verifies every installed package against npm
   registry provenance/signatures. A package published without provenance, or
   tampered with after publish, fails here even if no CVE has been filed yet.

### Adding or updating a dependency — the flow

1. `npm install <pkg>@<exact-version>` (`.npmrc` pins it exactly; no caret).
2. `npm run supply-chain` in that project. It fails if the version is newer
   than the cooldown, if the package brought an install script, if it carries
   a high/critical advisory, or if its registry signature doesn't verify.
3. Resolve whatever it flagged:
   - **Too new** → pin the previous release and pick the new one up later. If
     you genuinely need it now (it *is* the security fix), run once with
     `SUPPLY_CHAIN_MIN_AGE_DAYS=0` and say why in the commit message.
   - **New install script** → read what the script does, then add the exact
     `name@version` to `supply-chain-allowlist.json`.
   - **High/critical advisory** → `npm audit fix`; if the only fix is a
     breaking major, add a dated entry to `accepted-risk.json` explaining why
     it can't reach production.
4. Commit. The pre-commit hook re-runs `supply-chain` whenever `package.json`,
   the lockfile, `.npmrc`, or either policy file is staged; CI runs it on
   every push and PR regardless.

### Current accepted risks

`dailynutry-app` carries 4 high advisories in Expo/Metro build tooling
(`image-size`, `postcss`) accepted until **2026-11-24**. None of that code
ships inside the app bundle — it runs on the dev/CI machine during
`expo start` / `eas build`. The real fix is Expo SDK 54 → 57, a breaking
upgrade that needs its own pass with device testing. When the review date
passes, the check starts failing until that upgrade happens or the
acceptance is re-justified. `ai-gateway` has no accepted risks: it is at
0 vulnerabilities.

**CI (`.github/workflows/`)**
- `ci.yml` — `npm ci` (never `npm install`, so the lockfile is the only
  source of truth), typecheck, lint, tests, build, then `npm run
  supply-chain`, for both projects.
- `codeql.yml` — static analysis (SAST) over the TypeScript/JavaScript in both
  projects, on push/PR to `main` plus a weekly scheduled sweep.
- `dependency-review.yml` — blocks a PR that introduces a dependency with a
  known high/critical vulnerability or a new copyleft license, before it ever
  reaches a lockfile on `main`. Requires the repository's Dependency graph to
  be enabled.

**Every action is pinned to a full commit SHA**, with the version in a trailing
comment. `@v4` is a *mutable* tag: whoever controls the action's repository can
repoint it at any commit, and everyone using the tag runs the new code on their
next run — with access to the workflow's secrets. It is the same class of attack
`save-exact=true` addresses for npm, except actions run with more privilege than
a build dependency does.

To update one, resolve the new SHA with
`git ls-remote --tags https://github.com/<owner>/<repo>.git`, change the trailing
version comment to match, and do not revert to a tag. Note that some actions
(`dependency-review-action`) no longer publish a floating major tag at all, so a
SHA or an exact version is the only option regardless.

**After adding or updating a dependency**, run `npm run supply-chain` in that
project locally before committing — it's the same gate CI runs, just faster
to iterate on.

## Untrusted input: images

Everything reaching `/api/extract` came from a camera or a gallery picker, so
it is whatever the sender chose to send. The declared `mimeType` is a claim by
the client and is never taken at face value.

**Before any provider call costs money** (`ai-gateway/src/core/image-validation.ts`):
- **Magic bytes** decide the real format, and a declared type that disagrees
  with the bytes is refused outright.
- **Dimensions** are read from the JPEG frame header / PNG IHDR and bounded, so
  a header declaring gigapixels is rejected rather than forwarded.
- **EXIF is stripped.** This is a privacy control, not an attack control: a
  phone photo of a printed sheet carries the GPS of the room it was taken in,
  and forwarding it hands a third-party LLM provider the user's home address
  for no benefit. Removing the APP1 segment needs no re-encode, so the pixels
  come out byte-identical.

No library is used, deliberately. `sharp` (the strongest option, since it
re-encodes) needs an install script that `.npmrc` blocks, and its releases are
routinely newer than the cooldown floor; `image-size` is the package already in
`accepted-risk.json` for denial-of-service in its own parsers; `file-type`
identifies formats but not dimensions, so the header walk would be needed
anyway. Since the walk is required regardless, magic bytes come nearly free
inside it.

**What is deliberately NOT defended here.** These images are never stored,
never served, and never executed — they are base64 in a request, forwarded to a
provider, then dropped. That removes the classic file-upload risk class
(polyglot web shells, path traversal on write, browser content sniffing), all
of which need the file to be written and later served. Prompt injection through
text rendered *inside* an image is real and no byte-level check can see it; it
is contained downstream by the Zod schema constraining what the model may
return.

## Untrusted input: content refusals

When a provider refuses an image on content-safety grounds, that is a verdict
about the input, not a transient failure. It used to be raised as a retryable
error, which meant the gateway responded by sending the refused content to the
next provider and then the one after — distributing it across every vendor
account and paying for each rejection.

It now stops the chain immediately (`ContentRejectedError`), returns 422, and
is counted against the device. Three refusals within 24 hours block that device
for 24 hours (`ai-gateway/src/core/content-policy.ts`).

A **timed block**, not revocation, because the costs are asymmetric: a false
positive on a timed block costs one day and clears itself, while a false
positive on revocation costs the user the app until a human intervenes. Safety
classifiers do fire on bad lighting and on innocuous medical imagery, so false
positives are expected. Support can lift a block early (`unblockDevice`).

Quota is refunded when a request is rejected before any provider call — the
quota caps spend, and a rejected image costs nothing, so a blurry photo must
not eat into a user's daily allowance.

## Audit trail

`audit_event` records every action and how the gateway answered. It is
separate from `request_log`, which answers "what did this cost"; this answers
"what did this caller DO" — where a support conversation starts, and what a
future automated support agent will need.

**Coverage is total; content is not.** These are two different decisions and
conflating them causes confusion, so stated separately:

**Which events — everything.** Registrations, revocations, authentication
outcomes (success and failure), invalid requests, invalid images, rate
limiting, quota exhaustion, content refusals, blocks, mutations, and
successful extractions. An audit that records only failures cannot answer
"what was this user doing before it broke".

**Which fields — everything except two narrow categories**, excluded for legal
reasons rather than tidiness:

1. **Image bytes.** Persisting content a safety filter refused would mean the
   gateway now *stores* the material it declined to process. For the category
   of content that filter exists to catch, that converts a refusal into
   hosting.
2. **Extracted plan text** — patient names, prescribed foods. Health data,
   *dado pessoal sensível* under LGPD Art. 5 II. Audit tables are the ones
   nobody ever deletes, so copying plan content here would quietly turn the log
   into a medical record carrying its own retention, consent and erasure
   obligations.

**A hash replaces them.** `imagesHash` (SHA-256, already computed for the cache
key) is recorded on refusals, failures and successes. It answers the questions
an investigation actually asks — has this exact image been submitted before, by
how many devices, how often — without holding one byte of it. One device
sending many different refused images is a person with a bad camera; one image
arriving from twenty devices is a campaign, and only `sightingsOfHash` tells
them apart.

Everything else IS recorded: who, when, from where, endpoint, method, status,
duration, user agent, image dimensions and sizes, declared vs actual format,
refusal reasons, provider and model, cost, and **before/after for every
mutation** — a log saying only "the factor is now 0.5" cannot tell you whether
anything changed, which is the point of an audit.

**Never throw.** Auditing runs alongside a user's request; a logging failure
must not become their error.

Queries for support:
- `deviceTimeline(deviceId)` — one device's history, newest first.
- `eventsForReference(id)` — every event of one request. The id is echoed to
  the client in `x-request-id`, so "it failed, code abc-123" resolves exactly.
- `sightingsOfHash(hash)` — every device that submitted one image.

## Application security

- **Rate limiting** — `ai-gateway/src/cache/redis.ts`. Atomic Redis
  `INCR`+`EXPIRE` via Lua, keyed per caller (device or IP), with an
  in-process fallback if Redis is unreachable. Fails closed: a limiter that
  can't reach its store denies rather than allowing unlimited requests.
- **Auth** — device-bound bearer tokens (`ai-gateway/src/core/device-auth.ts`,
  `ai-gateway/src/db/device.ts`), hashed at rest, with a daily quota and
  revocation. The observability dashboard sits behind HTTP Basic auth
  (`ai-gateway/src/proxy.ts`), disabled (503) rather than left open if
  credentials aren't configured.
- **Fail-closed vs. fail-open** — chosen deliberately per subsystem: cache
  misses fail open (serve without caching), auth and rate limiting fail
  closed (deny rather than silently allow).
