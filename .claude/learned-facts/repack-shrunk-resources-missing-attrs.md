# A repacked APK from AGP 9 fails to build its resources on attributes R8 removed

**Date**: 2026-11-10
**Category**: build
**Key files**: `scripts/ci/repack-android.ts`, `.github/actions/repack/action.yml`

## Detail

Since AGP 9.0, `shrinkResources` goes through R8's optimized resource
shrinking by default (React Native 0.88 pins AGP 9.2.1; 0.86 pinned 8.12.0,
where it was opt-in). It removes attributes that no kept code reads while the
XML it keeps still names them. The APK runs, but the resources apktool decodes
from it no longer link: on the SDK 58 release APK, `apktool build` stops on
Material's `state_dragged`, `state_swiped`, `state_with_icon` and
`widthChange`:

```
W: res/animator/m3_card_state_list_anim.xml:7: error: attribute state_dragged (aka com.fredrikburmester.streamyfin:state_dragged) not found.
W: error: failed linking file resources.
```

repack-app's CLI has no way around it; its API takes a `spawnAsync`, which the
repack script wraps to declare the missing attributes in the decoded
`res/values/attrs.xml` and build again.

Rules:

- Declare a missing attribute with no format (`<attr name="widthChange" />`):
  it then takes any value, and the shrunk XML gives `widthChange` a fraction.
- Check a repacked APK with `aapt2 dump resources` against its source: every
  resource keeps its ID, because apktool writes the source's IDs to
  `public.xml`; only the declared attributes and a `raw/keep` entry are new.
- The list of attributes moves with Material and the shrinker. Do not hard-code
  it, read it from aapt2's errors.
