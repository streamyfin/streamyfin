# jellyseerr to seerr migration

Design settled on 18 September 2026. It replaces the June design, which proposed a
generated SDK published to npm.

## The problem

The app depends on `utils/jellyseerr`, a git submodule pointing at
`herrrta/jellyseerr@models`, a fork of the Seerr server. It takes 44 symbols from it across
26 modules: response types, enums, a permission function and three data tables from the web
interface.

What that costs today:

- the fork has diverged: 69 commits ahead and **518 behind** upstream's `develop` on
  18 September 2026, so the types describe a server nobody runs any more;
- a clone without `git submodule update --init` does not compile, which has already cost a
  whole diagnosis on a fresh worktree;
- we depend on one person maintaining a fork of a server in order to type a mobile client;
- and the name is dead upstream. The project is called Seerr.

## What was measured

Everything below was measured on 18 September 2026, against `seerr-api.yml` v3.4.1 and
against a real Seerr server running `develop`, with an authenticated session.

### The spec covers the surface

216 operations, 181 with a typed JSON body, 35 with no body, **no free-form schemas**. All
**31 calls the app makes are declared**. `openapi-typescript` turns the file into 10,227
lines in a single `.d.ts`, in 69 ms.

### But it is not a contract on the way back

`server/index.ts` mounts `express-openapi-validator` with `validateRequests: true` and
nothing on responses, so nobody checks the response half.

Shapes were captured from 29 routes answering 200: **106 differences across 12 routes**.
87 properties served and not declared, 13 declared required and absent, 6 declared
non-nullable and served as `null`.

| Route | Differences | What is going on |
|---|---|---|
| `/settings/public` | 26 | serves `fullPublicSettings` (28 properties), the spec declares `PublicSettings` (2) |
| `/media` | 19 | `MediaInfo` declares 6 of 25 |
| `/auth/me` | 15 | serves the whole user, the spec describes a third shape |
| `/user` | 14 | serves the filtered user; `email` is declared required and stripped by `User.filteredFields` |
| `/request` | 11 | `MediaRequest` without `type`, `tags`, `seasons`, `isAutoRequest` |
| `/service/radarr` and `/service/sonarr` | 7 each | declare `RadarrSettings` and `SonarrSettings`, serve `ServiceCommonServer` |
| `/settings/discover` | 3 | `DiscoverSlider` without `order`, `createdAt`, `updatedAt` |
| `/discover/movies`, `/discover/tv`, `/issue`, `/regions` | 1 each | one missing property |

One outright error beyond that count: `/tv/{id}` declares `numberOfSeason` while the server
sends `numberOfSeasons`.

**Corrected on 21 September:** this section also claimed that `/tv/{id}/season/{n}`
declared a summary and served the episodes. That is wrong: `Season` does declare
`episodes`. The only gap on that route is `externalIds`, served and not declared. The error
came from summarising the measurement too quickly, and the corrections test caught it by
refusing a correction the spec already covers.

### The enums are not typed

`MediaStatus`, `MediaRequestStatus`, `IssueType`, `IssueStatus`, `Permission` and
`DiscoverSliderType` come out as `number`, their values living only in a prose description.
`mediaType` comes out as `string` rather than a union.

The direct consequence: **generating from the spec alone would lose type quality** against
the submodule we have. That is what disqualified generation on its own.

### The unions, on the other hand, are exact

`/discover/*` and `/search` declare their results as an `anyOf` of `MovieResult`,
`TvResult` and `PersonResult`. Every real element matches one variant exactly, with no
unknown field. Only `mediaInfo` is missing when the title has no media entry in Seerr,
which is correct.

## The cause, in their architecture

Three things add up upstream.

**There is no output layer.** `server/entity/User.ts` is both the typeorm row and what
`/auth/me` serves, so the served shape has no name. Worse, one `User` schema covers two
different serialisations: `/auth/me` returns the whole user, `/user` returns it through
`User.filteredFields`, which strips `email`, `plexId`, `password`, `resetPasswordGuid`,
`jellyfinDeviceId`, `jellyfinAuthToken`, `plexToken` and `settings`. The schema describes a
third shape that is neither, and it declares `plexToken` and `jellyfinAuthToken`, which the
API never sends.

**The spec is written by hand** beside the code, with nothing holding it to the behaviour.

**Their only consumer lives in the same repository.** The Next.js interface imports
`server/**` directly, so the missing contract costs them nothing. The app's submodule is
giving the mobile client the same privilege the web interface has: that is why it works,
and why it cannot be clean.

## Options rejected

**Vendoring the upstream sources.** Impossible: the closure runs through 54 files and 37
runtime packages, typeorm, axios, zod, undici, web-push.

**An SDK of our own on npm.** Dropped: maintaining a project like that is not ours to do,
and an SDK generated from the spec inherits every gap above. One already exists,
`@billos/seerr-sdk`, and it is its author who opened upstream issue #3298 because the
generated types made his requests fail.

**Generating our types from the upstream code.** Technically feasible, and it was the
surprise of the study: the **type** closure of the 44 symbols touches only 39 files and
references only two external packages, `EntityManager` from typeorm and three zod types,
all inside methods a shape extraction throws away. Rejected anyway, for two reasons. It
makes us the owner of a generator wired to someone else's internals, which is the submodule
trap with extra steps. And it would encode fields the API strips before answering, such as
`plexToken`, so the types would be wrong exactly at the boundary that matters.

**Generating from the spec alone.** Not enough, measured above.

## The design

Three layers under `utils/seerr/`, plus the machinery that keeps them current.

### 1. `generated/api.d.ts`

Produced from the pinned `seerr-api.yml` by `openapi-typescript`. Types only, erased at
compile time, never edited by hand. The pin lives in `generated/pin.json`: repository, tag
and the sha256 of the source. The generated file carries the same fingerprint in its
header, so an edit by hand shows up.

### 2. `types.ts`

The layer we own, and it has to stay small. It holds exactly what the spec cannot give:

- the numeric enums, the `Permission` bitmask and `hasPermission`;
- the unions discriminated on `mediaType`;
- the corrections for the routes measured wrong, each with a comment saying what was
  measured and when, so we know what to drop the day upstream fixes it.

Estimated from what the app imports: 250 to 350 lines. That is what the submodule was
really providing.

### 3. `data.ts`

`networks`, `studios`, `genreColorMap`, `COMPANY_LOGO_IMAGE_FILTER`, `ANIME_KEYWORD_ID`.
Constants, not code. Copied once, with their provenance and Seerr's MIT licence.

The HTTP client itself, the `JellyseerrApi` class in `hooks/useJellyseerr.ts`, does not
move in this work. It changes types.

## The machinery

**`scripts/seerr/generate-types.ts`** fetches the spec at the pinned ref, runs
`openapi-typescript` over the very text it hashed, and writes the generated file and the
fingerprint.

**`.github/workflows/seerr-spec.yml`**, weekly and on demand. It compares Seerr's latest
release with the pin. When the generated file changes, it opens a pull request whose body
says where to look. Nothing merges on its own.

**`bun run seerr:capture`** replays the routes the app uses against a Seerr and writes
**shape-only** fixtures under `utils/seerr/__fixtures__/`: keys and the type of each value,
never the values. No URL, no token, no title, nothing personal.

**`utils/seerr/contract.test.ts`** runs on every pull request, without network and without
secrets. For each fixture it checks that the type the app uses accepts the real response
and that no served key is missing from the type. A field added or renamed upstream turns it
red and names the route and the field.

### Two regimes

On every pull request, the fixture test alone: milliseconds, nothing to install.

When the pin moves, and only then, the workflow brings up a Jellyfin and a Seerr in
containers, wires them through the API, runs the capture and commits the refreshed fixtures
into the same pull request as the spec. Two facts make that possible without a secret:
Seerr carries its own TMDB key in `server/api/themoviedb/index.ts`, and the first
administrator is created by `POST /auth/jellyfin` with `hostname`.

Not running a real server on every pull request is deliberate. What the contract test
catches only changes with a Seerr release, every four to eight weeks. Paying for a server
on every pull request would import a network dependency on TMDB into a CI that does not
need one.

### A limit we accept

The test only sees what the fixtures captured. That is why the capture is a single command,
and why it is replayed automatically when the pin moves.

## Delivery

A `seerr-migration` branch off `develop`. It stays open for the length of the work, each
part arrives on it through its own pull request, and a single pull request goes to
`develop` at the end. The same shape as the plugin rewrite.

1. **The generator and its workflow.** Adds `scripts/seerr/`, `utils/seerr/generated/` and
   `.github/workflows/seerr-spec.yml`. Touches nothing that exists.
2. **The hand-owned layer.** `types.ts` and `data.ts` with their tests. Nothing consumes
   them yet.
3. **The capture and the contract test.** Holds layers 1 and 2 against measured shapes.
4. **The switch.** The client and the hooks move onto the new types, the `utils/jellyseerr`
   submodule and the `utils/_jellyseerr` folder go. The typecheck is the judge, plus a pass
   on a device across the Seerr screens.
5. **The rename.**

Never pass `--delete-branch` while merging a pull request another one is stacked on: it
closes the child.

## The rename and the migrations

Measured in the app: 100 files, 1526 occurrences, 7 i18n keys, 14 uses of the MMKV keys,
4 deep link routes.

Three things cannot be renamed in one cut:

- **the MMKV keys** `JELLYSEERR_USER` and `JELLYSEERR_COOKIES` are read under the old name,
  written under the new one, and the old one is removed after the rewrite;
- **the deep link routes** `/jellyseerr/...` stay served as redirects, because they may be
  in links that have already been shared;
- **the i18n keys** go through Crowdin, with `en.json` as the source.

On the plugin side, 27 files and 166 occurrences, and only two exposed keys,
`jellyseerrServerUrl` and `jellyseerrApiKey`. The plugin has served the `seerr` block
**and** the flat keys since its #198, exactly for this. The flat keys stay served as long
as published versions of the app read them, and the internal rename goes as an ordinary
pull request onto the plugin's `develop`.

## Upstream

The subject is known there. Issue #3298 has been open since 27 July 2026, and a maintainer
has confirmed that parts of the spec are outdated.

Two pull requests have already attempted the bulk correction and died the same way. #2700,
which fixed exactly the schemas measured here, took three review comments with no answer
from its author, then conflicts, then the stale label, then closure. #2158, 49 commits on
the yaml, has been conflicting since February 2026. Meanwhile a short, single-subject pull
request, #3425 on the watchlist request schema, is alive.

So no third bulk schema pull request. What we bring, and what nobody has tried, is the
structural fix: turning response validation back on in their test environment, so their own
Cypress suite refuses a response that does not match the spec. One pull request, one
subject, and the field corrections become mechanical for everyone afterwards.

**Our migration depends on them for nothing.** Our layer covers the gaps today and shrinks
if and when they fix them.

## Risks

**The generated file is large.** 10,227 lines, 316 KB. It is pure type, so none of it
reaches the bundle, but it weighs on diffs and on the language server. Mitigated by never
reading it by hand: the refresh pull request carries the summary of what changed, not the
raw diff.

**The rename is massive.** 1526 occurrences. Mitigated by keeping it out of the switch and
keeping it mechanical.

**The fixtures come from one server.** A Plex installation, or one without Radarr, will
serve different shapes. Mitigated by the fact that the interesting gaps are missing fields
rather than extra ones, and that the capture can be replayed by any maintainer against
their own installation.
