# Seerr rename, implementation plan

**Goal:** call Seerr "Seerr" everywhere in the app, from the code to the names it stores and
the translation keys, and read what an earlier build stored under the old names while
people update.

**Architecture:** one pull request stacked on #2093 (`seerr/switch-imports`). A codemod
renames everything, in two commits that anyone can produce again. The old names then come
back in one place only, the code that reads what an earlier build left behind: four
migrations written by hand, each with its tests. #2079, which reads the plugin's `seerr`
block, comes in as its own commit before the codemod, so the codemod renames what it reads
into.

**Tooling:** Bun, TypeScript, Expo Router, react-native-mmkv, expo-secure-store, Biome,
`bun test`.

**Design:** `docs/superpowers/specs/2026-09-18-seerr-migration-design.md`, section "The
rename and the migrations". This plan keeps its direction, migrating rather than keeping
old names, and changes its three points: more is stored under the old name than the two
MMKV keys it lists, the routes get no redirect, and the translation keys are renamed too.
Task 11 brings the section in line.

## Constraints that apply to every task

- **Bun only**, never `npx` or yarn. Scripts run through `bun run`.
- Everything committed here is in **English**: code, identifiers, comments, documents.
- Comments are targeted. A comment explains a choice that is not obvious from the line.
- Storage keys and other constants live in `constants/`, with one definition each.
- In `translations/`, only `en.json` changes. The other languages are Crowdin's.
- Every behaviour change arrives with its tests. `mock.module` is global in Bun, so a
  double lives in `test-utils/` and covers the whole module it replaces: a double missing
  one export breaks whichever spec imports that export after it.
- The checks pass before each commit: `bun run typecheck`, `bun test`, `bunx biome check .`
  and `bun run i18n:check`.
- Stacked on #2093. Never pass `--delete-branch` when merging a pull request another one is
  stacked on: it closes the child.
- `/code-review` at the highest level, inline, before the push.

## What the measurement found

Measured on 2026-09-28 at `4b3de8f5`, the head of #2093, so after the switch.

- **Size.** 63 files and 900 lines mention jellyseerr outside the generated types, the
  fixtures, these documents and the translations. 40 files move. 98 distinct names.
- **Stored on a device under the old name.** The Seerr session under `JELLYSEERR_USER` and
  `JELLYSEERR_COOKIES` in MMKV, both JSON strings. The password auto-login keeps, in the
  secure store under `jellyseerrpw_` followed by the server and the account. The gateway
  headers set for Seerr: their configuration in MMKV under
  `custom_headers_config_jellyseerr`, their values in the secure store under keys owned by
  the scope `integration:jellyseerr`, which `secureValues.ts` will not reuse or delete from
  another scope. The user's settings `jellyseerrServerUrl`, `jellyseerrApiKey` and
  `autoLoginJellyseerr`, in the settings object in MMKV.
- **Served by the plugin.** `PluginLockableSettings` is keyed by the app's `Settings`, and
  the plugin sends those three settings as flat keys spelt jellyseerr. Since #198 it also
  sends them as a `seerr` block (`serverUrl`, `apiKey`, `autoLogin`), and since #159 it
  accepts `seerr*` from administrators. Every plugin release before #198 sends the flat keys
  only. The app keeps a copy of what the plugin last sent, in MMKV.
- **Translated.** 84 keys carry jellyseerr in their path, not 7: 59 under `jellyseerr.`, 24
  under `home.settings.plugins.jellyseerr.`, and `home.intro.jellyseerr_feature_description`.
  The code uses them 143 times, and 33 languages hold 2,521 translations of them. Every
  English value already says Seerr, and no key named seerr exists yet.
- **Routes.** Five route files sit under two `jellyseerr/` folders. Fifteen strings in the
  app lead to one of them, ten navigations and five screen declarations. Four of the
  navigations are cast `as any`, so the typecheck cannot vouch for every one. Nothing
  outside the app builds a link to them: the plugin's Seerr notifications carry no link, and
  the Jellyfin ones route by item type and id.
- **Query keys.** About 27 query keys contain `"jellyseerr"`, and one invalidation,
  `["search", "jellyseerr"]`, relies on matching them.
- **Visible labels.** Four places say "Jellyseerr" in code rather than in a translation: the
  settings page title, its group title, the entry in the plugins list and the TV custom
  headers list.
- **What a text search misses.** `clearAllJellyseerData` (one r), `'jellysearr_search'`,
  `setjellyseerrServerUrl`, an upstream link to `github.com/Fallenbagel/jellyseerr/...` in a
  comment, "Seerr (formerly Jellyseerr)" in the README, and the README screenshot
  `assets/images/jellyseerr.PNG`.
- **A file git reads as binary.** `utils/customHeaders/resolve.ts` holds a raw NUL byte as
  the separator of a cache key, since #1961. Git and GitHub show no diff for it.
- **Tests that cannot load a module.** `utils/jellyfin/checkServer.test.ts` replaces all of
  `@/utils/secureCredentials` for the whole run, so no spec can load the real one reliably.
  `@/utils/log` pulls in Sentry, which needs React Native's `AppRegistry`.
- **Around the stack.** `develop` has 10 commits `seerr-migration` lacks, and 2 of them touch
  files this renames (`CLAUDE.md`, `app/_layout.tsx`). #2103, open on `develop`, adds a
  storage migration numbered 2. 12 open pull requests to `develop` touch the files that
  move: #2073, #1907, #1779, #1766, #1656, #1618, #1518, #1484, #1436, #1301, #1292, #1185.
  They have to follow the switch in #2093 anyway, and the rename adds the new paths to that.

## Decisions

1. **Everything is renamed**: code, files, routes, query keys, labels, settings, stored
   names, translation keys. The only jellyseerr left in the app is the code that reads the
   old names, the upstream link, and the README's two mentions of the old product.
2. **What an earlier build stored is read under the old name once, and moved:**
   - the Seerr session, by a storage migration at launch, before the Seerr code loads;
   - the user's three Seerr settings, when the settings load, the way `showTVHeroCarousel`
     became `showHeroCarousel`, and the record of plugin defaults already applied, which
     is keyed by setting name;
   - the password auto-login keeps, on first use;
   - the gateway headers, on first use, values included, the old secure keys deleted.
   An older build installed after the update finds nothing under the old names: signed out
   of Seerr, the password to type again, the gateway headers to set again. Accepted.
3. **The plugin changes nothing now.** Its `develop` already takes both spellings and serves
   both shapes. The app reads the block and falls back to the flat keys, which is what every
   plugin before #198 sends. The flat keys go in the plugin's breaking release, once the
   apps in the field read the block (plugin plan P6.1), and the app's fallback goes with
   them.
4. **#2079 comes in as its own commit**, before the codemod. It stays open on `develop`, where
   it has become redundant with this; closing it is its author's call.
5. **Translation keys are renamed in `en.json`.** After the final merge into `develop`, the
   2,521 translations are restored on Crowdin under the new keys, the way it was done for
   #1804 and #1818, before the Crowdin sync pull request merges and before a release. Until
   then, those 84 strings show in English in the other languages.
6. **No redirect for the old routes.** Nothing links to them from outside. If something ever
   does, one `app/+native-intent.tsx` that rewrites `/jellyseerr/` to `/seerr/` covers every
   route at once.
7. **The storage migration takes number 2 here.** Whichever of it and #2103's reaches
   `develop` second is renumbered above the other, or it would never run on a device already
   stamped past it.
8. **The README screenshot keeps its file name.** Other pages may link to it.
9. **The mechanical part is a codemod**, in two phases and two commits. Anyone can run it
   again on the parent commit and compare, and it can produce both commits again if the
   base moves.

## Review focus

The failure modes most likely to reach someone using the app, and what pins each:

1. **An update from a build before the rename.** The session, the three settings, the
   password and the gateway headers must all survive it. Tasks 7 to 10 pin each move, and
   Task 12 goes through the whole update on a device.
2. **A plugin from before #198.** It sends only the flat keys, and the Seerr address and its
   lock must still apply. Task 8 pins it.
3. **A request made from the search results.** The results refresh on their own afterwards,
   so the renamed invalidation has to match the renamed queries. The codemod renames them in
   one pass and reports anything left, and Task 12 makes a request on a device.
4. **Every screen reached by a path string**, on phone and TV: a title, a person, a company, a
   genre, the settings page. Task 5 greps for any path left, Task 12 opens each one.
5. **The translations.** Every key the code uses must exist in `en.json`, which
   `i18n:check` holds. The other languages show English for the renamed strings until
   Crowdin is restored, which is expected and written in the pull request.

## Files

| File | What happens to it |
|---|---|
| `utils/customHeaders/resolve.ts` | The NUL byte becomes `\u0000` (Task 2) |
| `test-utils/secureStore.ts`, `test-utils/log.ts` | New shared doubles (Task 3) |
| `utils/customHeaders/secureValues.test.ts` | Uses the shared double (Task 3) |
| `utils/atoms/settingsOverrides.ts`, its test, `utils/atoms/settings.ts` | #2079 (Task 4) |
| 40 files | Move to seerr names, with every path that names them (Task 5) |
| 62 files | Identifiers, query keys, labels, logs, comments, translation keys (Task 6) |
| `constants/Seerr.ts`, `constants/Seerr.test.ts` | New: stored names, current and legacy (Task 7) |
| `utils/migrations.ts`, its test, `hooks/useSeerr.ts` | The session moves (Task 7) |
| `utils/atoms/settingsOverrides.ts`, `utils/atoms/settings.ts`, their tests | The settings move (Task 8) |
| `utils/seerrPassword.ts`, its test, `utils/secureCredentials.ts` and callers | The password moves (Task 9) |
| `utils/customHeaders/integrations.ts`, its test | The headers move (Task 10) |

---

## Task 1: the branch

`seerr/rename` starts from the head of `seerr/switch-imports`. Check the base first: a branch
made before a fix on the one below works on a stale state without saying so.

```bash
git fetch origin
git switch seerr/rename 2>/dev/null || git switch -c seerr/rename origin/seerr/switch-imports
git merge-base --is-ancestor origin/seerr/switch-imports HEAD && echo "base is current"
```

This plan is committed last, once it says what was done.

## Task 2: make `resolve.ts` readable to git

**Files:** `utils/customHeaders/resolve.ts`, the cache key in `getIntegrationHeaders`.

The separator between the integration and the server in `integrationHeaderCache` is a raw
NUL character in the source. Written as the escape `\u0000`, the string is the same at run
time and the file is text again.

- [ ] **Step 1: replace the byte**

```bash
python3 - <<'PY'
from pathlib import Path
path = Path("utils/customHeaders/resolve.ts")
source = path.read_bytes()
assert source.count(b"\x00") == 1
path.write_bytes(source.replace(b"\x00", b"\\u0000"))
PY
```

- [ ] **Step 2: check it**

Run: `file utils/customHeaders/resolve.ts`. Expect `UTF-8 text`, where it said `data`.
Run: `bun run typecheck && bun test utils/customHeaders`. Expect green.

- [ ] **Step 3: commit**

```bash
git add utils/customHeaders/resolve.ts
git commit -m "style(headers): write the cache key separator as an escape" \
  -m "The separator was a raw NUL byte, which makes git and GitHub treat the file as binary and hide its diff. \u0000 is the same character."
```

The base of this pull request still holds the byte, so GitHub's combined diff keeps showing
`resolve.ts` as binary. The commits after this one show it as text.

## Task 3: one double per module, shared

**Files:** create `test-utils/secureStore.ts` and `test-utils/log.ts`, modify
`utils/customHeaders/secureValues.test.ts`.

Tasks 9 and 10 load `expo-secure-store` and `@/utils/log`. `secureValues.test.ts` stubs the
first on its own, without the asynchronous half the app also calls, and two doubles of one
module make the suite depend on file order.

- [ ] **Step 1: the secure store double**, covering the five calls the app makes:

```ts
import { mock } from "bun:test";

const values = new Map<string, string>();

/**
 * `expo-secure-store` needs its native module, so specs stub it, and
 * `mock.module` is global: two specs bringing two doubles of the same module
 * hand the whole run whichever registered last. One double, one backing map,
 * with the synchronous and the asynchronous halves of the API the app calls.
 */
export const stubSecureStore = () =>
  mock.module("expo-secure-store", () => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) =>
      void values.set(key, value),
    deleteItemAsync: async (key: string) => void values.delete(key),
  }));

export const clearSecureStore = () => values.clear();

/** What a spec needs to set up or read back the stored values directly. */
export const secureStoreValues = values;
```

- [ ] **Step 2: the log double**, the whole module, the shape `utils/atoms/settings.test.ts`
  already stubs:

```ts
import { mock } from "bun:test";
import { atom } from "jotai";

/**
 * `@/utils/log` pulls in Sentry, which needs React Native's AppRegistry, so a
 * spec that only needs the import to resolve stubs it. The shape is the whole
 * module: `mock.module` is global, and a double missing one export fails
 * whichever spec imports that export after it.
 */
export const stubLog = () =>
  mock.module("@/utils/log", () => ({
    writeToLog: () => undefined,
    logAndCaptureError: () => undefined,
    writeInfoLog: () => undefined,
    writeErrorLog: () => undefined,
    writeDebugLog: () => undefined,
    readFromLog: () => [],
    useLog: () => ({ logs: [], clearLogs: () => undefined }),
    LogProvider: ({ children }: { children: unknown }) => children,
    default: atom([]),
  }));
```

The five specs that stub `@/utils/log` on their own keep doing so. Moving them is a cleanup
of its own.

- [ ] **Step 3: `secureValues.test.ts` uses the shared double.** Its local `mock.module` of
  `expo-secure-store` and its `Map` give way to:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { secureStoreValues, stubSecureStore } from "@/test-utils/secureStore";

stubSecureStore();
```

- [ ] **Step 4: run the suite, in file order and shuffled**

Run: `bun test`. Expect 554 passing.
Run: `for s in 1 2 3 4 5 6; do bun test --randomize --seed=$s 2>&1 | grep '^(fail)'; done`.
Expect nothing but `dev builds do not report > a dev build never initializes the SDK`, which
fails the same way on the base for some seeds and is not this pull request's.

- [ ] **Step 5: commit**

```bash
git add test-utils/secureStore.ts test-utils/log.ts utils/customHeaders/secureValues.test.ts
git commit -m "test: share one secure store double and one log double between specs"
```

## Task 4: #2079, as it is

- [ ] **Step 1: take its commit**

```bash
git cherry-pick 31f773db
```

It applies without a conflict: `readIntegrationBlocks` in `utils/atoms/settingsOverrides.ts`
and its five tests, called where the plugin's settings are fetched.

- [ ] **Step 2: check it**

Run: `bun run typecheck && bun test`. Expect green and 559 passing.

## Task 5: the codemod, paths phase

**Files:** 40 files move and 42 change.

- [ ] **Step 1: save the codemod outside the repository**

Copy `rename-seerr.ts` from the appendix to a folder outside the repository, for example
`~/scratch/rename-seerr.ts`. It is a tool for these two commits, not code the app keeps.

- [ ] **Step 2: dry run**

Run from the repository root: `bun ~/scratch/rename-seerr.ts paths`.
Expect `paths: 42 files changed, 106 occurrences renamed, 40 files moved (dry run)`, followed
by the 40 moves, among them `components/jellyseerr/` to `components/seerr/`,
`hooks/useJellyseerr.ts` to `hooks/useSeerr.ts` and both `jellyseerr/` route folders to
`seerr/`. The codemod stops if a destination exists already.

- [ ] **Step 3: write, format and check**

Run: `bun ~/scratch/rename-seerr.ts paths --write && bunx biome check --write .`.
The shorter paths change the order of some imports and a few line breaks, which Biome fixes.
A checkout where Metro has run holds `.expo/types/router.d.ts`, generated and ignored by
git, which still lists the old routes and fails the typecheck on the new ones. Regenerate it
without Metro, then check it lists the same routes under their new names:

```bash
EXPO_ROUTER_APP_ROOT="$PWD/app" bun -e 'require("@expo/router-server/build/typed-routes").regenerateDeclarations(".expo/types", {})'
```

A fresh clone, like the one CI runs on, has no such file.
Run: `bun run typecheck && bun test && bunx biome check .`. Expect green and 559 passing.
Run: `git grep -n -E 'jellyseerr/(page|person|company|genre)|plugins/jellyseerr' -- app components hooks utils providers`.
Expect nothing, where there were 15 lines. A stale import would already fail the typecheck.
Run: `git status --short | grep -c '^R'`. Expect 40.

- [ ] **Step 4: commit**

`git add -u` rather than `-A`: `git mv` already staged the moves, and this plan is not
tracked yet.

```bash
git add -u
git commit -m "refactor(seerr): move the files and folders to seerr" \
  -m "Produced by the codemod in docs/superpowers/plans/2026-09-28-seerr-rename.md, paths phase, then biome check --write. Imports, routes and screen names follow the files."
```

## Task 6: the codemod, names phase

**Files:** 62 files change, `translations/en.json` among them.

- [ ] **Step 1: dry run**

Run: `bun ~/scratch/rename-seerr.ts names`.
Expect `names: 62 files changed, 970 occurrences renamed, 0 files moved (dry run)`, then:

```
kept on purpose:
     1  formerly Jellyseerr
     1  images/jellyseerr.PNG
     1  https://github.com/Fallenbagel/jellyseerr/blob/8a097d5195749c8d1dca9b473b8afa96a50e2fe2/src/components/Common/StatusBadgeMini/index.tsx#L33C1-L62C4
no unexpected leftover
```

- [ ] **Step 2: write, format and check**

Run: `bun ~/scratch/rename-seerr.ts names --write && bunx biome check --write .`.
Run: `bun run typecheck && bun test && bunx biome check . && bun run i18n:check`. Expect
green, 559 passing, `No missing keys` and `No unused keys`.
Run: `git diff --stat -- translations`. Expect `en.json` alone, its keys renamed and its
values untouched.

- [ ] **Step 3: read the hunks the typecheck cannot judge**

The four visible labels, now "Seerr". The two filter keys in
`components/search/DiscoverFilters.tsx`, both `seerr_search`: `FilterButton` keys its query
with the title and the id as well, so they stay apart. The template key
`home.settings.plugins.seerr.order_by.${seerrOrderBy}` and the keys it builds in `en.json`.
The README, where the screenshot and "formerly Jellyseerr" are untouched. And
`readIntegrationBlocks`, which now fills `seerrServerUrl`, `seerrApiKey` and
`autoLoginSeerr` from the block. The flat keys the plugin sends, spelt jellyseerr, are no
longer read at all until Task 8.

- [ ] **Step 4: commit**

```bash
git add -u
git commit -m "refactor(seerr): call it seerr in the code" \
  -m "Produced by the codemod in docs/superpowers/plans/2026-09-28-seerr-rename.md, names phase, then biome check --write. Identifiers, query keys, labels, settings, stored names and the translation keys in en.json. What an earlier build stored under the old names is read again in the commits that follow."
```

## Task 7: the session moves

**Files:** create `constants/Seerr.ts`, `constants/Seerr.test.ts`; modify
`utils/migrations.ts`, `utils/migrations.test.ts`, `hooks/useSeerr.ts`.

- [ ] **Step 1: the failing tests**

`constants/Seerr.test.ts`, which pins the values a device holds:

```ts
import { expect, test } from "bun:test";
import * as stored from "./Seerr";

// The legacy names are what earlier builds wrote to devices: the migrations
// only find that data if these stay exactly what those builds used.
test("the names Seerr data is stored under", () => {
  expect({ ...stored }).toEqual({
    SEERR_USER_STORAGE_KEY: "SEERR_USER",
    SEERR_COOKIES_STORAGE_KEY: "SEERR_COOKIES",
    SEERR_PASSWORD_KEY_PREFIX: "seerrpw_",
    LEGACY_SEERR_USER_STORAGE_KEY: "JELLYSEERR_USER",
    LEGACY_SEERR_COOKIES_STORAGE_KEY: "JELLYSEERR_COOKIES",
    LEGACY_SEERR_PASSWORD_KEY_PREFIX: "jellyseerrpw_",
    LEGACY_SEERR_HEADERS_NAME: "jellyseerr",
  });
});
```

In `utils/migrations.test.ts`, the injected store gains `getString`:

```ts
  getString: (key: string) => data.get(key) as string | undefined,
```

and a `describe` for the move:

```ts
describe("the Seerr session", () => {
  // An install from before the rename, already past migration 1.
  const before = () => {
    data.clear();
    data.set("storageSchemaVersion", 1);
  };

  test("moves to the names it has now", () => {
    before();
    data.set("JELLYSEERR_USER", '{"id":7}');
    data.set("JELLYSEERR_COOKIES", '["connect.sid=s%3A1"]');

    runStorageMigrations(store);

    expect(data.get("SEERR_USER")).toBe('{"id":7}');
    expect(data.get("SEERR_COOKIES")).toBe('["connect.sid=s%3A1"]');
    expect(data.has("JELLYSEERR_USER")).toBe(false);
    expect(data.has("JELLYSEERR_COOKIES")).toBe(false);
  });

  // A device that already signed in under the new names keeps that session:
  // the old one is older by construction.
  test("keeps a session already under the new names", () => {
    before();
    data.set("SEERR_USER", '{"id":9}');
    data.set("JELLYSEERR_USER", '{"id":7}');

    runStorageMigrations(store);

    expect(data.get("SEERR_USER")).toBe('{"id":9}');
    expect(data.has("JELLYSEERR_USER")).toBe(false);
  });
});
```

- [ ] **Step 2: run them and watch them fail**

Run: `bun test constants/Seerr.test.ts utils/migrations.test.ts`. Expect
`Cannot find module './Seerr'`, and the two session tests failing on `SEERR_USER` undefined.

- [ ] **Step 3: the constants**

`constants/Seerr.ts`:

```ts
/** MMKV: the signed-in Seerr user. */
export const SEERR_USER_STORAGE_KEY = "SEERR_USER";

/** MMKV: the Seerr session cookies. */
export const SEERR_COOKIES_STORAGE_KEY = "SEERR_COOKIES";

/** SecureStore: prefix of the password auto-login keeps, per server and user. */
export const SEERR_PASSWORD_KEY_PREFIX = "seerrpw_";

/*
 * Where builds from before the rename stored the same things, when Seerr was
 * called Jellyseerr. Each is read once, moved to the name above, and deleted.
 * They can go once no such build is left to update from.
 */

export const LEGACY_SEERR_USER_STORAGE_KEY = "JELLYSEERR_USER";
export const LEGACY_SEERR_COOKIES_STORAGE_KEY = "JELLYSEERR_COOKIES";
export const LEGACY_SEERR_PASSWORD_KEY_PREFIX = "jellyseerrpw_";

/** The name Seerr's custom headers were filed under, in MMKV and SecureStore. */
export const LEGACY_SEERR_HEADERS_NAME = "jellyseerr";
```

In `hooks/useSeerr.ts`, the local `SEERR_USER` and `SEERR_COOKIES` give way to
`SEERR_USER_STORAGE_KEY` and `SEERR_COOKIES_STORAGE_KEY` from `@/constants/Seerr`.

- [ ] **Step 4: the migration**

In `utils/migrations.ts`, `MigrationStorage` gains
`getString: (key: string) => string | undefined;` and `MIGRATIONS` a second entry:

```ts
  {
    version: 2,
    description:
      "move the Seerr session from the keys it had when Seerr was called Jellyseerr",
    run: (store) => {
      for (const [legacy, current] of [
        [LEGACY_SEERR_USER_STORAGE_KEY, SEERR_USER_STORAGE_KEY],
        [LEGACY_SEERR_COOKIES_STORAGE_KEY, SEERR_COOKIES_STORAGE_KEY],
      ] as const) {
        const stored = store.getString(legacy);
        if (stored !== undefined && store.getString(current) === undefined) {
          store.set(current, stored);
        }
        store.remove(legacy);
      }
    },
  },
```

It runs at launch from `@/utils/bootstrap`, before `hooks/useSeerr.ts` reads the session into
its atom.

- [ ] **Step 5: run them and watch them pass**, then the whole suite and the checks.

- [ ] **Step 6: commit**

```bash
git commit -m "fix(seerr): move the stored session to its new keys"
```

## Task 8: the settings move

**Files:** `utils/atoms/settingsOverrides.ts`, `utils/atoms/settings.ts`, and their tests.

**Interfaces:**
- Produces: `LEGACY_SEERR_SETTINGS`, the three pairs `[legacy, current]`;
  `renameLegacySeerrSettings(stored: Record<string, unknown>): boolean`, true when it
  changed something; `readIntegrationBlocks(plugin)` reading the block first, then the flat
  keys; `fetchPluginSettings(api)`, the plugin's answer under the app's names.

Four places hold Seerr's settings under the old names, and the first two versions of this
task missed the last two: the user's settings, the stored copy of the plugin's, the record
of plugin defaults already applied, which is keyed by setting name, and the value the
refresh hands back to its caller, where `JellyfinProvider` reads `seerrServerUrl` to sign in
to Seerr at login. The redaction of the app log needs the same reading, since the plugin
sends the Seerr admin key under its old flat name and inside the block.

- [ ] **Step 1: the failing tests**, in `utils/atoms/settingsOverrides.test.ts`:

```ts
describe("renameLegacySeerrSettings", () => {
  test("carries the settings an earlier build stored to their new names", () => {
    const stored: Record<string, unknown> = {
      jellyseerrServerUrl: "http://seerr.example",
      jellyseerrApiKey: "a-key",
      autoLoginJellyseerr: false,
    };

    expect(renameLegacySeerrSettings(stored)).toBe(true);
    expect(stored).toEqual({
      seerrServerUrl: "http://seerr.example",
      seerrApiKey: "a-key",
      autoLoginSeerr: false,
    });
  });

  test("keeps a value already set under the new name", () => {
    const stored: Record<string, unknown> = {
      seerrServerUrl: "http://new.example",
      jellyseerrServerUrl: "http://old.example",
    };

    renameLegacySeerrSettings(stored);

    expect(stored).toEqual({ seerrServerUrl: "http://new.example" });
  });

  test("says when there was nothing to carry", () => {
    expect(renameLegacySeerrSettings({ seerrApiKey: "a-key" })).toBe(false);
  });
});
```

and, beside the block tests #2079 brought:

```ts
  // Every plugin release before #198 sends only these, and a stored copy from
  // an earlier build holds them too.
  test("a plugin that sends only the flat keys is read under the new names", () => {
    const read = readIntegrationBlocks(
      plugin({
        jellyseerrServerUrl: { locked: true, value: "http://seerr.example" },
        autoLoginJellyseerr: { locked: false, value: true },
      } as never),
    );

    expect(read!.seerrServerUrl).toEqual({
      locked: true,
      value: "http://seerr.example",
    });
    expect(read!.autoLoginSeerr).toEqual({ locked: false, value: true });
    expect("jellyseerrServerUrl" in read!).toBe(false);
  });

  test("the block wins over the flat keys, which the plugin keeps in step", () => {
    const read = readIntegrationBlocks(
      plugin({
        jellyseerrServerUrl: { locked: false, value: "http://flat.example" },
        seerr: {
          locked: false,
          value: { serverUrl: { locked: false, value: "http://block.example" } },
        },
      } as never),
    );

    expect(read!.seerrServerUrl).toEqual({
      locked: false,
      value: "http://block.example",
    });
  });
```

The test #2079 named "the flat keys win" goes: the flat keys are the old shape now.

Beside `pluginRefreshOverlay`'s tests, a default an earlier build recorded as applied under
the old name is not applied again over what the user chose since, and the record comes back
under the new names. In `utils/atoms/settings.test.ts`, `redactPluginSettings` hides the
Seerr key sent flat as `jellyseerrApiKey` and inside the block, and `fetchPluginSettings`,
given a fake `getStreamyfinPluginConfig`, hands back `seerrServerUrl` and `seerrApiKey`
with neither old shape left, and nothing when the server does not answer.

- [ ] **Step 2: run them and watch them fail.** `renameLegacySeerrSettings` is not exported,
  and the flat keys come back unread.

- [ ] **Step 3: the reading**

In `utils/atoms/settingsOverrides.ts`:

```ts
/**
 * The three Seerr settings under the names they had when Seerr was called
 * Jellyseerr, and their names now. Earlier builds stored them under the old
 * names, and the plugin still sends them so for the apps already in the field.
 */
export const LEGACY_SEERR_SETTINGS = [
  ["jellyseerrServerUrl", "seerrServerUrl"],
  ["jellyseerrApiKey", "seerrApiKey"],
  ["autoLoginJellyseerr", "autoLoginSeerr"],
] as const;

/** Moves the user's Seerr settings to their new names. True if it moved one. */
export const renameLegacySeerrSettings = (
  stored: Record<string, unknown>,
): boolean => {
  let changed = false;
  for (const [legacy, current] of LEGACY_SEERR_SETTINGS) {
    if (!(legacy in stored)) continue;
    if (stored[current] === undefined) stored[current] = stored[legacy];
    delete stored[legacy];
    changed = true;
  }
  return changed;
};
```

`readIntegrationBlocks` reads the block first, then fills what it left out from the flat
keys, and drops both old shapes from what it returns. Its comment says the flat keys leave
the plugin in its breaking release, and this fallback with them.

`pluginRefreshOverlay` runs `renameLegacySeerrSettings` on a copy of the applied record
before it compares.

In `utils/atoms/settings.ts`, `loadSettings` calls `renameLegacySeerrSettings(stored)` beside
the `showTVHeroCarousel` rename, and `migratePluginSettings` runs `readIntegrationBlocks`, so
the stored copy of the plugin's settings is read the same way as a fresh one.
`redactPluginSettings` reads first, then redacts. The fetch in the settings hook becomes
`fetchPluginSettings(api)`, extracted as it was first, suite green, then made to return
`migratePluginSettings(data?.settings)`: what the refresh hands back and what it seeds
defaults from are the read form.

- [ ] **Step 4: run them and watch them pass**, then the whole suite and the checks.

- [ ] **Step 5: commit**

```bash
git commit -m "fix(seerr): read the Seerr settings under their old names too"
```

## Task 9: the password moves

**Files:** create `utils/seerrPassword.ts` and `utils/seerrPassword.test.ts`; modify
`utils/secureCredentials.ts` and the callers of the three functions.

The three Seerr password functions leave `secureCredentials.ts` for a module of their own:
no spec can load `secureCredentials.ts` itself, and they need nothing else from it.

- [ ] **Step 1: the failing tests**, in `utils/seerrPassword.test.ts`:

```ts
import { beforeEach, expect, test } from "bun:test";
import {
  clearSecureStore,
  secureStoreValues,
  stubSecureStore,
} from "@/test-utils/secureStore";

stubSecureStore();

const { deleteSeerrPassword, getSeerrPassword } = await import(
  "./seerrPassword"
);

const account = btoa("https://media.example:user-1").replace(/[^a-zA-Z0-9]/g, "_");

beforeEach(clearSecureStore);

// Auto-login signs in to Seerr with the Jellyfin password. Kept under the old
// name by an earlier build, it has to be found on the first launch after the
// update, or nobody gets signed in.
test("finds the password an earlier build kept, and moves it", async () => {
  secureStoreValues.set(`jellyseerrpw_${account}`, "correct horse");

  expect(await getSeerrPassword("https://media.example", "user-1")).toBe(
    "correct horse",
  );
  expect(secureStoreValues.get(`seerrpw_${account}`)).toBe("correct horse");
  expect(secureStoreValues.has(`jellyseerrpw_${account}`)).toBe(false);
});

test("reads the new name first", async () => {
  secureStoreValues.set(`seerrpw_${account}`, "battery staple");

  expect(await getSeerrPassword("https://media.example", "user-1")).toBe(
    "battery staple",
  );
});

// Signing out has to forget the password under either name.
test("deletes it under both names", async () => {
  secureStoreValues.set(`seerrpw_${account}`, "a");
  secureStoreValues.set(`jellyseerrpw_${account}`, "b");

  await deleteSeerrPassword("https://media.example", "user-1");

  expect(secureStoreValues.size).toBe(0);
});
```

- [ ] **Step 2: run them and watch them fail** on the missing module.

- [ ] **Step 3: the module**

`utils/seerrPassword.ts` takes the three functions and the key builder from
`secureCredentials.ts` as they are, with `SEERR_PASSWORD_KEY_PREFIX` from
`@/constants/Seerr`, and the key builder takes the prefix as a parameter. Then:

```ts
export async function getSeerrPassword(
  serverUrl: string,
  userId: string,
): Promise<string | null> {
  const key = passwordKey(serverUrl, userId, SEERR_PASSWORD_KEY_PREFIX);
  const current = await SecureStore.getItemAsync(key);
  if (current !== null) return current;

  // Kept by a build from before the rename: moved on first use.
  const legacyKey = passwordKey(
    serverUrl,
    userId,
    LEGACY_SEERR_PASSWORD_KEY_PREFIX,
  );
  const legacy = await SecureStore.getItemAsync(legacyKey);
  if (legacy !== null) {
    await SecureStore.setItemAsync(key, legacy);
    await SecureStore.deleteItemAsync(legacyKey);
  }
  return legacy;
}
```

`deleteSeerrPassword` deletes both keys. `secureCredentials.ts` imports `deleteSeerrPassword`
where it removes an account, and the other callers import from `@/utils/seerrPassword`.

- [ ] **Step 4: run them and watch them pass**, then the whole suite and the checks.

- [ ] **Step 5: commit**

```bash
git commit -m "fix(seerr): find the auto-login password under its old name"
```

## Task 10: the gateway headers move

**Files:** `utils/customHeaders/integrations.ts`, create
`utils/customHeaders/integrations.test.ts`.

- [ ] **Step 1: the failing tests**

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { stubLog } from "@/test-utils/log";
import { clearMmkv, stubMmkv } from "@/test-utils/mmkv";
import {
  clearSecureStore,
  secureStoreValues,
  stubSecureStore,
} from "@/test-utils/secureStore";

stubLog();
stubMmkv();
stubSecureStore();

const { storage } = await import("@/utils/mmkv");
const { secureCustomHeaderMetadata } = await import("./secureValues");
const { getIntegrationHeaderConfig, updateIntegrationHeaderConfig } =
  await import("./integrations");

const header = (key: string, value: string) => ({ key, value, enabled: true });

/** What a build from before the rename left on the device for Seerr. */
const storedByAnEarlierBuild = () => {
  const customHeaders = secureCustomHeaderMetadata(
    "integration:jellyseerr",
    [header("CF-Access-Client-Secret", "secret")],
    [],
  );
  storage.set(
    "custom_headers_config_jellyseerr",
    JSON.stringify({ source: "custom", customHeaders }),
  );
};

describe("Seerr's custom headers", () => {
  beforeEach(() => {
    clearMmkv();
    clearSecureStore();
  });

  // Seerr's headers were filed under "jellyseerr" before the rename. Looking
  // for them under "seerr" alone would find nothing, and a gateway in front of
  // Seerr would refuse every request after the update.
  test("moves what an earlier build stored, secret included", () => {
    storedByAnEarlierBuild();

    expect(getIntegrationHeaderConfig("seerr")).toEqual({
      source: "custom",
      customHeaders: [
        expect.objectContaining({
          key: "CF-Access-Client-Secret",
          value: "secret",
        }),
      ],
    });
    expect(storage.getString("custom_headers_config_jellyseerr")).toBeUndefined();
    expect(storage.getString("custom_headers_config_seerr")).toBeDefined();
    expect(secureStoreValues.size).toBe(1);
  });

  test("saves under the new name, leaving nothing under the old one", () => {
    storedByAnEarlierBuild();

    updateIntegrationHeaderConfig("seerr", { source: "none", customHeaders: [] });

    expect(storage.getString("custom_headers_config_jellyseerr")).toBeUndefined();
    expect(JSON.parse(storage.getString("custom_headers_config_seerr") ?? "{}"))
      .toEqual({ source: "none", customHeaders: [] });
  });

  test("files the other integrations under their own names", () => {
    updateIntegrationHeaderConfig("streamystats", {
      source: "jellyfin",
      customHeaders: [],
    });

    expect(
      storage.getString("custom_headers_config_streamystats"),
    ).toBeDefined();
  });
});
```

- [ ] **Step 2: run them and watch them fail**: the first two find the old configuration
  still there.

- [ ] **Step 3: the move**

In `utils/customHeaders/integrations.ts`:

```ts
/**
 * Seerr's headers as a build from before the rename filed them, under
 * "jellyseerr". Moved on first use, secret values included, and the old
 * configuration and keys deleted.
 */
function moveLegacySeerrHeaders(): void {
  const legacyKey = `${INTEGRATION_CONFIG_KEY_PREFIX}${LEGACY_SEERR_HEADERS_NAME}`;
  const legacy = storage.getString(legacyKey);
  if (legacy === undefined) return;

  const config = parseHeaderConfig(legacy);
  if (storage.getString(configStorageKey("seerr")) === undefined) {
    const customHeaders = secureCustomHeaderMetadata(
      "integration:seerr",
      resolveCustomHeaderValues(config.customHeaders),
      [],
    );
    storage.set(
      configStorageKey("seerr"),
      JSON.stringify({ source: config.source, customHeaders }),
    );
  }
  deleteSecureCustomHeaderValues(config.customHeaders);
  storage.remove(legacyKey);
}
```

`getIntegrationHeaderConfig` and `updateIntegrationHeaderConfig` call it first when the key is
`"seerr"`.

- [ ] **Step 4: run them and watch them pass**, then the whole suite and the checks.

- [ ] **Step 5: commit**

```bash
git commit -m "fix(seerr): move the Seerr gateway headers to their new name"
```

## Task 11: the design, and this plan

- [ ] **Step 1: bring the design in line** (on #2087, `docs/seerr-migration-in-english`)

In `docs/superpowers/specs/2026-09-18-seerr-migration-design.md`, the section "The rename
and the migrations" up to the plugin paragraph becomes:

```markdown
## The rename and the migrations

Measured again once the switch had landed: 63 files and 900 lines, 40 files to move. More
is stored under the old name than the first measurement knew: the Seerr session, the
password auto-login keeps, the gateway headers set for Seerr, and the three Seerr settings.
84 translation keys carry the old name, not 7.

Everything is renamed, stored names and translation keys included, and what an earlier
build stored is read under the old name once and moved: the session by a storage migration
at launch, the settings when they load, the password and the headers on first use. An
older build installed after that finds nothing under the old names, which is accepted.

The translation keys are renamed in `en.json` only. After the final merge, their
translations are restored on Crowdin under the new keys before the sync pull request merges
and before a release.

The old routes get no redirect: nothing outside the app builds a link to them. If
something ever does, one `app/+native-intent.tsx` rewriting `/jellyseerr/` to `/seerr/`
covers every route.
```

In `docs/superpowers/plans/2026-09-18-seerr-migration.md`, Part 5 becomes:

```markdown
## Part 5: the rename

Planned on its own once the switch had landed, in `2026-09-28-seerr-rename.md`, which
moves more than this part listed and renames the translation keys too.
```

Show the diff, then commit and push to #2087.

- [ ] **Step 2: this plan**, brought up to date with what was done, committed on
  `seerr/rename`:

```bash
git add docs/superpowers/plans/2026-09-28-seerr-rename.md
git commit -m "docs(seerr): the plan this rename followed"
```

## Task 12: checks, the device pass, and the pull request

- [ ] **Step 1: the whole suite**

Run: `bun run typecheck && bun test && bunx biome check . && bun run i18n:check`.
Run: `bun run test`. Its last step, `doctor`, fails on out-of-date Expo packages, the same
as on `develop`.
Run: `git grep -n -i jellyseerr -- . ':!docs/superpowers' ':!translations/*' ':!utils/seerr/generated' ':!utils/seerr/__fixtures__'`.
Expect the three the codemod kept, `constants/Seerr.ts`, `LEGACY_SEERR_SETTINGS`, the
flat keys in `readIntegrationBlocks`' comment, and the tests of Tasks 7 to 10.

- [ ] **Step 2: an update, on a device**

A Seerr server on `develop`, a Jellyfin account that can sign in to it, and the plugin
serving the Seerr settings.

1. On the iOS simulator, with the JavaScript of #2093: sign in to Seerr with "Sign in
   automatically" on, and give Seerr a custom header of its own (Settings > Plugins >
   Jellyseerr, source "custom", any name and value). Open Discover.
2. Switch the branch to this one and reload the JavaScript, on the same install and the same
   data. The storage migration runs at this launch.
3. Discover loads with no sign-in: the session moved. Settings > Plugins > Seerr shows the
   same address and the same switch, and the header: the settings and the headers moved.
   Quit and relaunch: auto-login signs in, so the password moved.

- [ ] **Step 3: every screen, phone and TV**

On the iOS simulator and the Android TV emulator: Discover, then a film, a series, a person,
a company row and a genre row; the settings page from Settings > Plugins, whose title and
entry say "Seerr"; on TV, the custom headers list, which says "Seerr". With the plugin
locking the Seerr address, the field shows locked. In another language, the Seerr strings
show in English, as expected until Crowdin is restored.

- [ ] **Step 4: a request refreshes the results**

Take auto-approve away from the test account first: a request would start a download. From
the search results, request a film nobody has requested. Its status changes in the results
without a manual refresh. Delete the request, and give auto-approve back.

- [ ] **Step 5: review, push, open**

`/code-review` at the highest level, inline, on `seerr/switch-imports..seerr/rename`. Fix,
check again. The review found, and fixed: the record of applied plugin defaults and the
value the refresh hands back, both read under the old names only (folded into Task 8's
commit, nothing having been pushed), and three comments the codemod touched that carried an
em dash from before, given plain punctuation in a commit of their own. Re-running the
codemod on the parents of its two commits gives identical trees. Push `seerr/rename` and open it against `seerr/switch-imports`, titled
`refactor(seerr): rename jellyseerr to seerr`, with the repository template and the AI
badge. The description says what moves and how, that the two codemod commits can be checked
by running the codemod on their parent, that GitHub's combined diff shows `resolve.ts` as
binary because the base holds a NUL byte, what happens to the translations until Crowdin is
restored, the old path to new path table for the open pull requests that touch the moved
files, and the device pass. Then watch its comments, and ask CodeRabbit for a full review,
since reviews are off for this base branch.

## After the pull request

These wait for the final merge of `seerr-migration` into `develop`, or later:

- **Crowdin.** Restore the 2,521 translations under the new keys, from the old keys in
  `develop`'s locale files, before the Crowdin sync pull request merges. No release before
  that, or the other languages ship those 84 strings in English.
- **The storage migration's number**, against #2103's, whichever lands second.
- **The plugin's breaking release.** It stops sending the flat keys and accepting the old
  spelling, and updates its `AppSettingsManifest.json`. The app's fallback to the flat keys
  goes in the same step, and the legacy readers once no build from before the rename is left
  to update from.

---

## Appendix: the codemod

`rename-seerr.ts`, run from the repository root, kept outside of it:

```ts
#!/usr/bin/env bun
/**
 * Renames jellyseerr to seerr in the app: code, files, routes, settings,
 * stored names and translation keys. It leaves alone the other languages,
 * which Crowdin owns, links to somewhere else, and the few places that name
 * the old product on purpose. Reading what an earlier build stored under the
 * old names is written by hand afterwards.
 *
 *   bun rename-seerr.ts paths [--write]
 *     Moves files and folders, and rewrites every string that is a path to
 *     one: imports, routes, screen names, paths in the docs.
 *   bun rename-seerr.ts names [--write]
 *     Everything else: identifiers, query keys, labels, logs, comments.
 *
 * Without --write it only reports. Run it from the repository root, on a
 * clean tree, one phase per commit, paths first.
 */
import { mkdirSync, readdirSync, rmdirSync } from "node:fs";
import { dirname } from "node:path";
import { $ } from "bun";

const [phase, flag] = Bun.argv.slice(2);
const write = flag === "--write";

if (phase !== "paths" && phase !== "names") {
  console.error("usage: bun rename-seerr.ts <paths|names> [--write]");
  process.exit(1);
}

// History, generated code, measured shapes, and every language but English,
// which Crowdin owns: it gets the new keys from en.json.
const SKIPPED = [
  /^docs\/superpowers\//,
  /^utils\/seerr\/generated\//,
  /^utils\/seerr\/__fixtures__\//,
  /^translations\/(?!en\.json$)/,
];

const TEXT = /\.(tsx?|jsx?|json|md|ya?ml)$/;

const KEPT = [
  /https?:\/\/[^\s)"'`]+/g,
  /formerly Jellyseerr/g,
  // The README screenshot keeps its name: other pages may link to it.
  /images\/jellyseerr\.PNG/g,
];

const swap = (match: string): string => {
  const renamed = {
    jellyseerr: "seerr",
    Jellyseerr: "Seerr",
    JELLYSEERR: "SEERR",
  }[match];
  if (!renamed) throw new Error(`No rule for the casing "${match}"`);
  return renamed;
};

/** Hides what must survive, so a blanket replacement cannot reach it. */
const protect = (text: string) => {
  const saved: string[] = [];
  // Private use characters: no source file holds them, unlike a control one.
  const hide = (match: string) => `\uE000${saved.push(match) - 1}\uE001`;

  let hidden = text;
  for (const pattern of KEPT) hidden = hidden.replace(pattern, hide);

  return {
    hidden,
    saved,
    restore: (changed: string) =>
      changed.replace(/\uE000(\d+)\uE001/g, (_, index) => saved[Number(index)]),
  };
};

// A string holding a slash is a path: an import, a route, a screen name, a
// file named in the docs.
const PATH_LITERAL = /(["'`])([^"'`\n]*\/[^"'`\n]*)\1/g;

const rename = (text: string): string =>
  phase === "paths"
    ? text.replace(PATH_LITERAL, (literal) =>
        literal.replace(/jellyseerr/gi, swap),
      )
    : text
        .replaceAll("clearAllJellyseerData", "clearAllSeerrData")
        .replaceAll("jellysearr_search", "seerr_search")
        .replaceAll("setjellyseerrServerUrl", "setSeerrServerUrl")
        .replace(/jellyseerr/gi, swap);

const count = (text: string) => text.match(/jellyseerr/gi)?.length ?? 0;

const files = (await $`git ls-files`.text())
  .trim()
  .split("\n")
  .filter((file) => !SKIPPED.some((rule) => rule.test(file)));

let replaced = 0;
const changed: string[] = [];
const leftovers: string[] = [];
const kept = new Map<string, number>();

for (const file of files.filter((candidate) => TEXT.test(candidate))) {
  const before = await Bun.file(file).text();
  const { hidden, saved, restore } = protect(before);
  const after = restore(rename(hidden));

  if (after !== before) {
    changed.push(file);
    replaced += count(before) - count(after);
    if (write) await Bun.write(file, after);
  }

  if (phase === "names") {
    for (const entry of saved.filter((value) => /jellyseerr/i.test(value))) {
      kept.set(entry, (kept.get(entry) ?? 0) + 1);
    }
    const unprotected = protect(after).hidden;
    for (const line of unprotected.split("\n")) {
      if (/jellyseerr/i.test(line)) leftovers.push(`${file}: ${line.trim()}`);
    }
  }
}

const moves =
  phase === "paths"
    ? files
        .filter((file) => /jellyseerr/i.test(file) && !/\.PNG$/.test(file))
        .map((file) => [file, file.replace(/jellyseerr/gi, swap)] as const)
    : [];

const taken = moves.filter(([, to]) => files.includes(to));
if (taken.length) {
  throw new Error(`Already exists: ${taken.map(([, to]) => to).join(", ")}`);
}

if (write) {
  for (const [from, to] of moves) {
    mkdirSync(dirname(to), { recursive: true });
    await $`git mv ${from} ${to}`;
  }
  // git tracks files, not folders, so the old ones stay behind empty.
  for (const [from] of moves) {
    for (
      let folder = dirname(from);
      folder !== "." && /jellyseerr/i.test(folder);
      folder = dirname(folder)
    ) {
      try {
        if (readdirSync(folder).length === 0) rmdirSync(folder);
      } catch {}
    }
  }
}

console.log(
  `${phase}: ${changed.length} files changed, ${replaced} occurrences renamed, ${moves.length} files moved${write ? "" : " (dry run)"}`,
);
for (const [from, to] of moves) console.log(`  mv ${from} -> ${to}`);
if (phase === "names") {
  console.log("kept on purpose:");
  for (const [label, times] of [...kept].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(times).padStart(4)}  ${label}`);
  }
  console.log(
    leftovers.length
      ? `UNEXPECTED leftovers:\n${leftovers.map((line) => `  ${line}`).join("\n")}`
      : "no unexpected leftover",
  );
}
```
