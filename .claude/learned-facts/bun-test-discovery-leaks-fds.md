# bun test discovery leaks file descriptors, which breaks child-process stdio in tests

**Date**: 2026-08-30
**Category**: testing
**Key files**: `assets/bundled-assets.test.ts`

## Detail

Whenever `bun test` (bun 1.3.5) has to discover test files itself — the bare
`bun test` that `test:unit` and CI run, or a filter such as
`bun test assets/foo.test.ts` — it walks the whole tree (with `ios/` present,
about 4,600 directories) and leaves roughly 14,000 file descriptors open while
the tests run. A child spawned from a test then gets stdio pipes on very high
descriptors and every write to them fails: `spawnSync` reports the real exit
code but empty stdout/stderr, `/bin/echo` exits 1, and a `git check-ignore`
that should have printed matches prints nothing, so an assertion on its output
passes vacuously. Running the file explicitly (`bun test ./assets/foo.test.ts`
or an absolute path) skips discovery and works, which is why the failure only
shows up in the full suite.

Rules:

- Do not spawn processes from unit tests; do the work in-process (the ignore
  guard uses the `ignore` package instead of `git check-ignore`).
- When a test must shell out, verify it under a bare `bun test`, not only under
  an explicit path, and have the child write its result to a file rather than
  a pipe.
