# Subtitle fallback fonts (iOS / tvOS)

These faces exist for **libass inside the MPV player**, not for the React Native UI.
They are bundled on iOS/tvOS only (see the `expo-font` entry in `app.json`) and are
wired into mpv by `MPVLayerRenderer.setupSubtitleFonts()`.

Android does not need them: its libmpv build ships libass with the fontconfig
provider pointed at `/system/fonts`, so the device's own fonts are reachable.

## Why they are needed

MPVKit builds libass with the **CoreText** font provider. CoreText answers a
fallback query with a font *name*, which libass then has to open as a *file*.
Since iOS 18 the system CJK face moved to
`/System/Library/PrivateFrameworks/FontServices.framework/CorePrivate/PingFangUI.ttc`,
which a sandboxed app cannot read — and it uses a nonstandard `hvgl` table that
FreeType cannot parse anyway. Apple's guidance is to ship your own font rather
than read system font files.

See https://github.com/streamyfin/streamyfin/issues/1789.

## Files

| File | Covers | Slot in libass' lookup |
| --- | --- | --- |
| `NotoSans-Regular.ttf` | Latin (incl. Latin Extended-A), Greek, Cyrillic | `--sub-font` — glyph-checked |
| `NotoSansArabic-Regular.ttf` | Arabic | font DB, via CoreText fallback |
| `NotoSansHebrew-Regular.ttf` | Hebrew | font DB, via CoreText fallback |
| `NotoSansCJKsc-Regular.otf` | CJK, Kana, Hangul | linked as `subfont.ttf` — blind last resort |

## Provenance

- `NotoSans-Regular.ttf`, `NotoSansArabic-Regular.ttf`, `NotoSansHebrew-Regular.ttf`
  — https://github.com/notofonts/notofonts.github.io (`fonts/<family>/hinted/ttf/`)
- `NotoSansCJKsc-Regular.otf`
  — https://github.com/notofonts/noto-cjk (`Sans/OTF/SimplifiedChinese/`)
  sha256 `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`

At runtime, the renderer creates lightweight links from its cache directory to these
immutable bundle resources. This keeps the font cache out of backups and avoids
copying 17 MB during player startup.

All are licensed under the SIL Open Font License 1.1 — see `OFL.txt`.
