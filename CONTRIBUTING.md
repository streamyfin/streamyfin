# Contributing to Streamyfin

Thanks for helping out. Streamyfin ships to phones, tablets, Apple TV and Android TV from
one codebase, so a change that looks small usually has four places where it can go wrong.
This guide is about catching that before a reviewer has to.

Questions are welcome on [Discord](https://discord.streamyfin.app). Security issues go
through the [security policy](https://github.com/streamyfin/streamyfin/security/policy),
never through a public issue.

## Before you start

- Search the [issues](https://github.com/streamyfin/streamyfin/issues) first. If one
  describes your problem, say so there before opening a PR, and link it later with
  `Fixes #123`.
- For anything larger than a bug fix, open an issue or ask on Discord first. A design
  discussion after the code is written is a discussion nobody enjoys.
- Translations do not go through pull requests. They are managed on
  [Crowdin](https://crowdin.com/project/streamyfin). The only file a PR may touch is
  `translations/en.json`, the source catalogue.

## Setup

1. Node `>20`.
2. [Bun](https://bun.sh). **The project uses bun exclusively.** Do not use npm, yarn or
   npx: the lockfile is `bun.lock` and CI checks it against `package.json`.
3. Xcode and/or Android Studio, following the
   [Expo guides](https://docs.expo.dev/workflow/android-studio-emulator/).
4. The [Biome](https://biomejs.dev) extension in your editor.

```bash
bun i && bun run submodule-reload
bun run prebuild          # bun run prebuild:tv for the TV variant
bun run ios               # or: bun run android, bun run ios:tv, bun run android:tv
```

If an iOS build fails with `missing Metal Toolchain`, run
`bun run ios:install-metal-toolchain` once.

## While you work

The conventions live next to the code they govern:

- [docs/conventions/constants.md](docs/conventions/constants.md): where a value belongs.
- [docs/conventions/contributing-flow.md](docs/conventions/contributing-flow.md): the
  operational checklist for branches, PRs and reviews.
- [docs/conventions/tv.md](docs/conventions/tv.md): everything specific to Apple TV and
  Android TV, including the focus rules that are easy to break without noticing.
- [CLAUDE.md](CLAUDE.md): the architecture map, the provider stack and the patterns to
  follow. It is written for AI assistants but it is the fastest orientation for a human
  too.

Two rules catch most review comments before they are written:

- **Use `useAppRouter`**, not `useRouter` from `expo-router`, so offline mode survives
  navigation.
- **`.tv.tsx` file suffixes do not work here.** Use `Platform.isTV` and separate
  components.

## Before you open a pull request

```bash
bun run test
```

That runs typecheck, unit tests, lint, format, the i18n key check and expo doctor, which
is the same set CI runs. Read its output rather than trusting the exit code.

Then make sure the change carries its own proof:

- A bug fix has a test that fails on the reported behaviour and passes with the fix.
- A new shared or tunable value lives in `constants/`.
- A behaviour change that is not purely visual reaches phone and TV in the same PR.
- New UI strings exist in `translations/en.json` and nowhere else.
- [CLAUDE.md](CLAUDE.md) still matches the code. It is the map everyone reads first, human
  or assistant, so a new tab group, native module, provider or top level directory goes in
  it as part of the same PR.

## Pull requests

- Branch off `develop`.
- The PR title follows [Conventional Commits](https://www.conventionalcommits.org), for
  example `fix(player): keep the resume point when exiting`. CI validates it.
- Fill in every section of the template. Write N/A where a section genuinely does not
  apply, and tick a checklist box only when it is true. An unticked "verified on all
  platforms" is useful information; a ticked one that is not true is not.
- UI changes ship before and after screenshots for iOS and Android. Use a video for
  anything animated.
- Testing instructions are numbered steps a reviewer can follow without asking you a
  question.

### Testing on real devices

A simulator proves the code path runs. It does not prove hardware behaviour: volume
buttons, the silent switch, background playback, network loss, Chromecast, TV remotes.
Test those on a device before claiming they work.

For playback and reporting changes, the Jellyfin server log is the ground truth. Run the
scenario, then read what the server recorded.

### If you used AI

Declare it by uncommenting the badge line in the PR template. This is not a stigma, it is
a review signal. What is not acceptable is AI generated code that the author has not
personally tested on the target platforms: those PRs are closed on sight, because
reviewing them costs more than writing the change would have.

## After you open it

Wait for CI and for the automated review, and answer both. A red job is something to
investigate, not something to push past: reproduce it locally, and if it also fails on
`develop`, say so in the PR so the next person does not repeat the detour.

## License

By contributing you agree that your contribution is licensed under the
[MPL-2.0](LICENSE.txt), like the rest of the project.
