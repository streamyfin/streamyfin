# A Shared Route Pushed From Outside The Tabs Lands In The First Tab Group

**Date**: 2026-10-29
**Category**: navigation
**Key files**: `utils/tabRoutes.test.ts`, `app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/`, `node_modules/expo-router/build/fork/getStateFromPath-forks.js`

## Detail

A route in the shared group exists once per tab: `/series/1` matches
`(home)/series/[id]`, `(libraries)/series/[id]` and the rest. Expo Router ranks them in
`getRouteConfigSorter` by how many groups each shares with the screen the push comes
from, so a page opened inside a tab stays in that tab.

From a screen outside every tab group (Now Playing, the player, a link the app is opened
with), no candidate shares a group and the tie falls to file order. Metro sorts the
`require.context` keys, so that is the alphabetically first group. It was `(favorites)`
until favorites moved into the More menu: Now Playing's Go to artist opened in the
Favorites tab.

Native tabs do not show a group that has no trigger. `useVisibleTabsWithRedirect`
replaces a route in one with the initial tab, so the page is dropped and the app shows
Home. A tab group that sorts before `(home)` and is not in the bar on some platform
breaks every such push there.

So no tab group may sort before `(home)`. That is why the TV bar's own groups are
`(tv-favorites)`, `(tv-watchlists)` and `(tv-settings)`: develop's `(favorites)` would sort
first again, and the phone, which never shows it, would drop the page. `utils/tabRoutes.test.ts` resolves pushes
against the app's own routes and fails if one does. Notification routes
(`utils/notificationRoute.ts`) spell `(home)` out, so they do not depend on this order.
