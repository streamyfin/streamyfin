# A require hook registered from a spec outlives it and breaks later specs in the same worker

**Date**: 2026-10-04
**Category**: testing
**Key files**: `app.config.ts`, `app.config.test.ts`, `test-utils/tsxRequireHook.ts`, `package.json` (`jest.moduleNameMapper`)

## Detail

Jest gives each spec its own module registry and globals, but not its own Node
loader. `require("node:module")` inside a spec returns a subclass that shares
the real `Module._extensions` table, so a require hook registered from a spec
(`tsx/cjs`, `ts-node/register`, `@babel/register`, `pirates`) is installed on
the worker process and stays there after the spec's environment is torn down.

`app.config.ts` imports `tsx/cjs` for the Expo CLI, and `app.config.test.ts`
imports `app.config.ts`. After that spec, every file the worker required
outside a sandbox went through tsx's transformer, whose closure reads
`URLSearchParams` from the dead sandbox. There it is Expo's lazy "winter"
global, whose getter calls `require`, which Jest refuses after teardown
("You are trying to `import` a file after the Jest environment has been torn
down"), so the getter yields `undefined` and the hook throws
`URLSearchParams is not a constructor`.

The first uncached file such a worker loads is usually a Babel plugin resolved
on demand. `react-native-worklets/plugin` runs a nested `transformSync` with
plugins named as strings, so the victim was whichever worklet file was compiled
next, `utils/stickyHeader.ts` in practice. It needs three things at once: the
same worker ran `app.config.test.ts` earlier, the file is not in Jest's
transform cache (always true in CI), and the plugin is not yet in the worker's
require cache. That is why it was intermittent, hit unrelated PRs, and passed
when the suite ran alone.

To reproduce on a tree without the fix:

```bash
bun run test:unit -- --runInBand --no-cache app.config.test.ts utils/stickyHeader.test.ts
```

Rules:

- Never let a spec register a require hook. `tsx/cjs` is mapped to an empty
  module for every spec through `moduleNameMapper`; map any new hook the same
  way.
- A suite that fails to load with a stack running through a hook's transformer
  and a "torn down" warning naming another spec is this leak, not a fault in
  the failing suite. Look at the spec the warning names.
- Reproduce order dependent failures with `--runInBand --no-cache` and the
  suspect spec listed first, not by looping the whole suite.
