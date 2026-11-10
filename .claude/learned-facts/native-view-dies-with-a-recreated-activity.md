# Android: A View Added Over the App's Activity Dies When the System Recreates It

**Date**: 2026-11-04
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/output/OutputPickerPresenter.kt`, `android/app/src/main/AndroidManifest.xml`

## Detail

`MainActivity` declares `configChanges` for rotation, screen size, `uiMode`, `locale` and a few more,
so a rotation or a theme change keeps the same activity. Whatever the manifest leaves out recreates it:
a font size change (`fontScale`), a display size change (`density`), and the system destroying the
activity in the background. React Native draws its screens again on the new activity; a view a native
module added with `addContentView` stays on the old one and is gone from the screen.

Seen on 2026-11-04 with the output sheet: the font size set to 2.0 with the sheet open, `MainActivity`
logged `wm_on_destroy_called` then `wm_on_create_called`, the sheet vanished, and the presenter, still
holding its view and its controller, answered every later `present` with true without showing anything.

The presenter now watches its activity's lifecycle and closes the sheet on `ON_DESTROY`
(`OutputPickerPresenterTest`, with Robolectric's `ActivityController.recreate()`). Any other view added
over the activity needs the same: `NativePlayerSession` adds the native player that way, and its
`onActivityDestroyed` does nothing (not yet checked on a device).
