# jellyseerr to seerr migration, implementation plan

**Goal:** take the app off the `utils/jellyseerr` submodule and rename jellyseerr to seerr
everywhere, without losing type quality.

**Architecture:** three layers under `utils/seerr/`. Types generated from Seerr's pinned
OpenAPI spec, a hand-owned layer for what the spec cannot express, and the data tables the
Seerr web interface owns. A contract test, running without network, holds all of it against
response shapes measured on a real server.

**Tooling:** Bun, TypeScript, Biome, `bun test`, `openapi-typescript`, GitHub Actions.

**Design:** `docs/superpowers/specs/2026-09-18-seerr-migration-design.md`

## Constraints that apply to every task

- **Bun only**, never `npx` or yarn. Scripts run through `bun run`.
- Everything committed here is in **English**: code, identifiers, comments, documents.
- Comments are targeted. A comment explains a choice that is not obvious from the line.
- Constants live in `constants.ts` rather than scattered as literals.
- i18n: touch **only** `translations/en.json`, one key per whole sentence.
- Every behaviour change arrives with its tests.
- The checks pass before each commit: `typecheck`, `test:unit`, `lint`, `format` and
  `i18n:check`. `doctor` fails on out-of-date Expo packages and already does on `develop`.
- Shared test doubles live in `test-utils/`. Never put a local `mock.module("@/utils/mmkv")`
  in a spec: `mock.module` is global in Bun, and one double per spec turns the suite red
  depending on file order.
- Five pull requests stacked on `seerr-migration`. Never pass `--delete-branch` while
  another pull request is stacked on the branch being merged: it closes the child.
- `/code-review` at the highest level, inline, before every push.

## File layout

| File | What it is responsible for |
|---|---|
| `scripts/seerr/generate-types.ts` | Fetches the pinned spec, writes `api.d.ts`, `api-shapes.json` and the fingerprint |
| `scripts/seerr/capture.ts` | Measures response shapes against a real server |
| `scripts/seerr/shape.ts` | Reduces a JSON value to its shape, shared by the capture and the test |
| `utils/seerr/generated/pin.json` | Repository, tag and sha256 of the spec |
| `utils/seerr/generated/api.d.ts` | Generated types. Never edited by hand |
| `utils/seerr/generated/api-shapes.json` | Declared property paths, by route, for the contract test |
| `utils/seerr/corrections.ts` | The measured gaps between the spec and a real server |
| `utils/seerr/types.ts` | What the app reads: aliases, enums, unions, corrections |
| `utils/seerr/permissions.ts` | `Permission` and `hasPermission`, ported from upstream |
| `utils/seerr/data.ts` | `networks`, `studios`, `genreColorMap`, the web interface's own tables |
| `utils/seerr/__fixtures__/*.json` | Measured shapes: keys and types, never values |
| `utils/seerr/contract.test.ts` | Holds fixtures, declared shapes and corrections together |
| `.github/workflows/seerr-spec.yml` | Weekly refresh, opens a pull request |

---

## Landed

**Part 1, the generator and its workflow.** #2081. `scripts/seerr/generate-types.ts` and
its tests, the generated `utils/seerr/generated/`, the Biome exclusion, the `seerr:types`
script and `.github/workflows/seerr-spec.yml`.

**Part 2, the hand-owned layer.** #2086. `permissions.ts`, `types.ts`, `corrections.ts`
and `data.ts`, with 26 tests. Nothing consumes any of it yet.

---

## Part 3: the capture and the contract test

### Task 7: reducing a response to its shape

**Files:**
- Create: `scripts/seerr/shape.ts`
- Test: `scripts/seerr/shape.test.ts`

**Interfaces:**
- Produces: `shapeOf(value: unknown, depth?: number): Shape`, where
  `type Shape = string | { [key: string]: Shape }` and an array becomes `{ "[]": Shape }`.

- [ ] **Step 1: write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { shapeOf } from "./shape";

describe("shapeOf", () => {
  test("keeps the keys and the types, never the values", () => {
    expect(shapeOf({ id: 7, title: "Dune", adult: false })).toEqual({
      id: "number",
      title: "string",
      adult: "boolean",
    });
  });

  test("describes an array by its first element", () => {
    expect(shapeOf([{ id: 1 }, { id: 2 }])).toEqual({ "[]": { id: "number" } });
  });

  test("says an empty array is empty rather than guessing", () => {
    expect(shapeOf([])).toBe("array<empty>");
  });

  test("keeps null apart from a missing key", () => {
    expect(shapeOf({ plexUsername: null })).toEqual({ plexUsername: "null" });
  });

  test("stops descending so a deep response cannot blow the fixture up", () => {
    expect(shapeOf({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({
      a: { b: { c: "object" } },
    });
  });
});
```

The `null` test is there because a field declared non-nullable and served `null` is one of
the three kinds of gap that were measured, and a shape that flattened `null` into
`"object"` would hide it.

- [ ] **Step 2: run it and watch it fail**

Run: `bun test scripts/seerr/shape.test.ts`

- [ ] **Step 3: write the implementation**

```ts
export type Shape = string | { [key: string]: Shape };

/**
 * A response reduced to its keys and the type of each value.
 *
 * No value ever comes out of here: the fixtures live in the repository, and a
 * captured title, address or token would be a leak, not a test.
 */
export const shapeOf = (value: unknown, depth = 0): Shape => {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "array<empty>";
    if (depth >= 3) return "array";
    return { "[]": shapeOf(value[0], depth + 1) };
  }
  if (typeof value === "object") {
    if (depth >= 3) return "object";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, shapeOf(inner, depth + 1)]),
    );
  }
  return typeof value;
};
```

- [ ] **Step 4: run it and watch it pass**

Run: `bun test scripts/seerr/shape.test.ts`. Expect 5 passing.

- [ ] **Step 5: commit**

```bash
git add scripts/seerr/shape.ts scripts/seerr/shape.test.ts
git commit -m "feat(seerr): reduce a response to keys and types, never values"
```

### Task 8: the capture

**Files:**
- Create: `scripts/seerr/capture.ts`
- Create: `utils/seerr/routes.ts`
- Modify: `package.json`, adding a `seerr:capture` script

**Interfaces:**
- Consumes: `shapeOf` from task 7.
- Produces: `APP_ROUTES`, the routes the app calls, written as spec templates
  (`"GET /tv/{tvId}/season/{seasonNumber}"`) with example parameter values, so the capture
  and the test speak about the same keys.

- [ ] **Step 1: write the route list**

The 31 calls are in `hooks/useJellyseerr.ts`. Write them once, as constants, rather than as
literals scattered through the script.

- [ ] **Step 2: write the capture script**

It reads the address and the credentials from the environment, never from arguments, so
they do not end up in a shell history:

```ts
const base = process.env.SEERR_URL;
const username = process.env.SEERR_JELLYFIN_USER;
const password = process.env.SEERR_JELLYFIN_PASSWORD;
```

It opens a session with `POST /api/v1/auth/jellyfin` **without** `hostname`: a server that
is already configured answers 500 "Jellyfin hostname already configured" when it is sent.

It writes one file per route under `utils/seerr/__fixtures__/`, carrying the status and the
shape, and nothing else.

- [ ] **Step 3: run it against a real server**

Run: `SEERR_URL=... SEERR_JELLYFIN_USER=... SEERR_JELLYFIN_PASSWORD=... bun run seerr:capture`

Expect one file per reachable route, and one line per refused route with its status.

Read the written files before adding them. No title, no address, no identifier should be in
them. That reading is the part of this task that matters most.

- [ ] **Step 4: commit**

```bash
git add scripts/seerr/capture.ts utils/seerr/routes.ts utils/seerr/__fixtures__ package.json
git commit -m "feat(seerr): capture response shapes from a real server"
```

### Task 9: the contract test

**Files:**
- Create: `utils/seerr/contract.test.ts`

**Interfaces:**
- Consumes: `api-shapes.json` from part 1, `CORRECTIONS` from part 2, the fixtures from
  task 8.

- [ ] **Step 1: write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import declared from "./generated/api-shapes.json";
import { CORRECTIONS } from "./corrections";
import { fixtures } from "./__fixtures__";

describe("what a real server sends", () => {
  for (const [route, fixture] of Object.entries(fixtures)) {
    test(`${route} sends nothing we do not know about`, () => {
      const known = new Set([
        ...(declared[route] ?? []),
        ...(CORRECTIONS[route]?.added ?? []),
        ...(CORRECTIONS[route]?.renamed.map(([, served]) => served) ?? []),
      ]);
      const served = pathsOf(fixture.shape);
      expect(served.filter((path) => !known.has(path))).toEqual([]);
    });

    test(`${route} still needs every correction it carries`, () => {
      const served = new Set(pathsOf(fixture.shape));
      const stale = (CORRECTIONS[route]?.added ?? []).filter(
        (path) => declared[route]?.includes(path) && served.has(path),
      );
      expect(stale, "upstream now declares these, drop the correction").toEqual([]);
    });
  }
});
```

The second test is what makes our layer shrink over time: the day upstream declares a
property we were correcting, it goes red and says which entry to drop.

- [ ] **Step 2: run it and watch it fail**

Run: `bun test utils/seerr/contract.test.ts`. Expect `pathsOf is not defined`.

- [ ] **Step 3: write `pathsOf` and the fixture index**

`pathsOf` flattens a `Shape` into the notation `declaredShapes` uses, including the `*`
that stands for the keys of a free-form map. The same flattening on both sides is the only
thing that makes this test honest.

- [ ] **Step 4: run it and watch it pass**

Run: `bun test utils/seerr/contract.test.ts`. Expect one pair of tests per captured route.

Then check that it catches something: add an invented field to one fixture by hand, run it
again, watch it go red, and take it out. A contract test nobody has seen fail proves
nothing.

- [ ] **Step 5: commit, then `/code-review` at the highest level, then open the pull request**

```bash
git add utils/seerr/contract.test.ts
git commit -m "test(seerr): check the types against what a real server sends"
```

### Task 9b: refreshing the fixtures when the pin moves

**Files:**
- Modify: `.github/workflows/seerr-spec.yml`

This is the second regime the design describes, and it can only arrive here: the capture
does not exist before task 8.

- [ ] **Step 1: bring both servers up in the job**

After the types are regenerated, add a Jellyfin service and a Seerr service, then a step
that wires them through the API: create the Jellyfin administrator through the setup, then
call `POST /api/v1/auth/jellyfin` on Seerr **with** `hostname`, which creates the first
administrator there.

No secret is needed: Seerr carries its own TMDB key, so discover and search answer without
any configuration.

- [ ] **Step 2: replay the capture and commit the fixtures**

```yaml
      - name: Refresh the fixtures
        run: bun run seerr:capture
        env:
          SEERR_URL: http://localhost:5055
          SEERR_JELLYFIN_USER: contract
          SEERR_JELLYFIN_PASSWORD: ${{ steps.wire.outputs.password }}
```

The password is drawn at random by the wiring step and lives only for the length of the
job.

- [ ] **Step 3: prove the job**

Run it by hand from the Actions tab, with the pin deliberately moved back a version, and
check that the pull request it opens carries both the regenerated types and the refreshed
fixtures. A workflow that has never run for real is not a workflow that works.

- [ ] **Step 4: commit**

```bash
git add .github/workflows/seerr-spec.yml
git commit -m "ci(seerr): measure the shapes again when the pin moves"
```

---

## Part 4: the switch

### Task 10: move the imports and drop the submodule

**Files:**
- Modify: the 26 modules importing `@/utils/jellyseerr/**`, listed by
  `grep -rl "@/utils/jellyseerr" --include="*.ts" --include="*.tsx" .`
- Delete: `utils/jellyseerr` (the submodule), `utils/_jellyseerr`, the entry in
  `.gitmodules`

- [ ] **Step 1: redirect the imports**

One module at a time, starting with `hooks/useJellyseerr.ts`. Run `bun run typecheck` after
each. The typecheck is the judge here: it names exactly which field is missing, and that is
how a correction forgotten in part 2 shows up.

- [ ] **Step 2: remove the submodule**

```bash
git submodule deinit -f utils/jellyseerr
git rm -f utils/jellyseerr
rm -rf .git/modules/utils/jellyseerr
git rm -r utils/_jellyseerr
```

Check that nothing is left: `grep -rn "utils/jellyseerr" . --exclude-dir=node_modules`
should find nothing, and `.gitmodules` should be gone if it declared only that one.

- [ ] **Step 3: prove that a fresh clone builds**

```bash
git worktree add ../wt-seerr-check seerr-migration
cd ../wt-seerr-check && bun install && bun run typecheck
```

Expect it clean, **without** `git submodule update --init`. That is the result the whole
migration is after.

- [ ] **Step 4: run the whole suite**

`typecheck`, `test:unit`, `lint`, `format` and `i18n:check`, all green.

- [ ] **Step 5: a pass on a device**

Write a checklist with one line per Seerr screen and per platform: discover, search, a film,
a series with its seasons, a request, reporting a problem, the automatic sign in, and the
list of requests. The switch changes no behaviour, so the check is that everything is
exactly as it was.

- [ ] **Step 6: commit, review, open the pull request**

```bash
git commit -m "refactor(seerr): read the API types from utils/seerr and drop the submodule"
```

---

## Part 5: the rename

### Task 11: the stored keys

**Files:**
- Modify: `hooks/useJellyseerr.ts`, `utils/migrations.ts`
- Test: `utils/migrations.test.ts`

- [ ] **Step 1: write the failing test**

```ts
test("reads the Seerr session written under the old key and rewrites it", () => {
  storage.set("JELLYSEERR_USER", JSON.stringify({ id: 7 }));
  migrateSeerrKeys();
  expect(storage.getString("SEERR_USER")).toBe(JSON.stringify({ id: 7 }));
  expect(storage.getString("JELLYSEERR_USER")).toBeUndefined();
});

test("leaves a session already written under the new key alone", () => {
  storage.set("SEERR_USER", JSON.stringify({ id: 9 }));
  storage.set("JELLYSEERR_USER", JSON.stringify({ id: 7 }));
  migrateSeerrKeys();
  expect(storage.getString("SEERR_USER")).toBe(JSON.stringify({ id: 9 }));
});
```

The second case exists because someone who installs, goes back to an older build, then
updates again holds both keys. Overwriting the new one with the old would sign them out.

- [ ] **Step 2: run it and watch it fail**

Run: `bun test utils/migrations.test.ts`. Expect `migrateSeerrKeys is not a function`.

- [ ] **Step 3: write the migration**

```ts
const RENAMED = [
  ["JELLYSEERR_USER", "SEERR_USER"],
  ["JELLYSEERR_COOKIES", "SEERR_COOKIES"],
] as const;

/**
 * Carries a Seerr session written under the old key names.
 *
 * A device that installed, went back to an older build, then updated again
 * holds both keys. The new one is the one that was written last by a build
 * that knows about both, so it wins, and the old one goes either way.
 */
export const migrateSeerrKeys = (): void => {
  for (const [old, renamed] of RENAMED) {
    const carried = storage.getString(old);
    if (carried !== undefined && storage.getString(renamed) === undefined) {
      storage.set(renamed, carried);
    }
    storage.remove(old);
  }
};
```

- [ ] **Step 4: run it and watch it pass**

Run: `bun test utils/migrations.test.ts`. Expect 2 passing.

- [ ] **Step 5: commit**

```bash
git commit -m "fix(seerr): carry the stored session over to the new key names"
```

### Task 12: the mechanical rename

**Files:** 100 files, 1526 occurrences.

- [ ] **Step 1: rename the files and folders**

`git mv` for each, so the history follows.

- [ ] **Step 2: rename the identifiers**

Three separate passes, `jellyseerr`, `Jellyseerr`, `JELLYSEERR`, with a typecheck between
each. Leave the keys migrated in task 11 alone.

- [ ] **Step 3: keep the old deep link routes**

The `/jellyseerr/...` segments stay served and redirect to `/seerr/...`, because they may be
in links that have already been shared. One test per route kept.

- [ ] **Step 4: the i18n keys**

Rename in `translations/en.json` only, then let Crowdin propagate. Check with
`bun run i18n:check`.

- [ ] **Step 5: run the whole suite and the device pass**

- [ ] **Step 6: commit, review, open the pull request**

---

## Out of scope here

The rename on the plugin side, 27 files and 166 occurrences, goes as an ordinary pull
request onto the plugin's `develop`. The `jellyseerrServerUrl` and `jellyseerrApiKey` keys
stay served as long as published versions of the app read them; the plugin has served the
`seerr` block alongside them since its #198.

The upstream contribution, restoring response validation in Seerr, is a separate piece of
work and blocks nothing here.
