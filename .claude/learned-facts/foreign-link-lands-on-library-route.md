# A link the app does not know opens the library screen, with the link as the library id

**Date**: 2026-10-20
**Category**: navigation
**Key files**: `app/(auth)/(tabs)/(libraries)/[libraryId].tsx`, `app/+native-intent.ts`, `utils/nativeIntent.ts`, `utils/appLinking.test.ts`

## Detail

The library route is a dynamic segment at the root of its tab, so its path is
`/[libraryId]`: a one-word path that no static route claims lands there, the word taken
as the library id. Expo Router builds that path from the link the system opens the app
with, and for a custom scheme it reads the host as the first segment.

react-native-track-player gives its media session `trackplayer://notification.click` as
the activity to open, on Android. Tapping the music notification, or the system media
controls, opened the library screen for the library "notification.click", both in a
running app and on a cold start through the initial URL. The screen asked for
`/Items/notification.click`, then for the filters under that parent, and Jellyfin
answered each with a 400 (Sentry REACT-NATIVE-EM and EN).

`app/+native-intent.ts` drops the link: a falsy `redirectSystemPath` leaves a running app
where it was and starts a cold one where the launcher would. Before adding a route at the
root of a tab, or a dependency that opens the app with a link of its own, run
`utils/appLinking.test.ts`: it builds the linking from the real `app/` tree and shows
where a link lands.
