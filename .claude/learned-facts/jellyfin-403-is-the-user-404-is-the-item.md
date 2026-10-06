# Jellyfin 403 Is About The User, 404 About The Item

**Date**: 2026-10-06
**Category**: state-and-data
**Key files**: `hooks/useTwoWaySync.ts`, `utils/jellyfin/userDataAccess.ts`, `constants/Downloads.ts`

## Detail

An item the user can no longer see (library access removed, item deleted) is
answered with **404**, not 403: `LibraryManager.GetItemById(id, user)` returns
null for an item that is not visible, and the controllers turn that into
`NotFound()`.

A **403** from Jellyfin says something about the user:

- On `POST /UserItems/:id/UserData`: the user is not an administrator and
  their policy has `EnableUserPreferenceAccess` off
  (`RequestHelpers.AssertCanUpdateUser(..., restrictUserPreferences: true)`,
  10.9 to master). It applies to every item of that user. The playstate
  routes (`/Sessions/Playing*`, `/UserPlayedItems/:id`) do not carry the
  check.
- On every authenticated route alike: the user is outside their access
  schedule, or remote without the remote access permission
  (`DefaultAuthorizationHandler`). It passes with time or with the network
  the user is on.
- On any route that takes `userId`: the id is not the token's user and the
  caller is no administrator (`RequestHelpers.GetUserId` throws
  `SecurityException`).

A gateway in front of the server sends 403 as well, with an HTML page;
`isGatewayBlockError` in `utils/errors.ts` tells that one apart.

## Symptom pattern

A Sentry issue for a 403 on one route, a handful of users, the same request
repeated on every launch. The first guess is that the user lost access to the
item, which is the one cause it cannot be.
