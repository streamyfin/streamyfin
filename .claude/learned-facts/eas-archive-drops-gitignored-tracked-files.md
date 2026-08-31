# EAS archives drop files that match .gitignore, even when git tracks them

**Date**: 2026-08-30
**Category**: build
**Key files**: `.gitignore`, `assets/bundled-assets.test.ts`, `components/settings/SubtitlePreview.tsx`

## Detail

eas-cli does not upload the working tree. It makes a shallow copy of the
project and then removes every path that matches the ignore rules, using the
`ignore` npm package over `.easignore` (if present) or every `.gitignore`
(`vcs/local.ts`, class `Ignore`). Whether git tracks the file is irrelevant: a
file added with `git add -f` past a `*.mp4` rule exists in every clone and in
CI, and is missing on the EAS build machine.

The failure is silent when the `require()` for the asset sits inside a
`try/catch`. `@expo/metro-config` enables `allowOptionalDependencies`, so Metro
treats such a require as optional: an unresolvable one compiles to a runtime
throw instead of failing `expo export:embed`, the IPA ships, and the screen
shows its error state (subtitle preview, TestFlight build 292).

Rules:

- A JS-required asset must not match any `.gitignore` rule. Re-include it right
  below the rule (`!assets/sample_subtitled.mp4`); `assets/bundled-assets.test.ts`
  fails when one slips through.
- Keep asset `require()` calls at module scope so a missing file fails the
  bundle.
- To check what EAS would upload: `eas build:inspect --platform ios --profile
  production --stage archive --output <dir>` and look for the file.
