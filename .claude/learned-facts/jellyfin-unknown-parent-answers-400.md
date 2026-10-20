# Jellyfin Answers an Unknown Parent With a 400, Not a 404

**Date**: 2026-10-20
**Category**: state-and-data
**Key files**: `utils/errors.ts` (`isStaleIdError`), `utils/reportDataError.ts`, `utils/log.tsx`, `utils/sentry.ts`

## Detail

`GET /Items` and `GET /Items/Filters` with a `parentId` the server does not know answer `400`, `text/plain`, body `Error processing request.`: the ExceptionMiddleware's answer to the `ArgumentException: Invalid parent id` that `LibraryManager.GetParentItem` throws. Not a 404, so it reads like a request the app built wrong. Replayed against Jellyfin 10.10.7, 10.11.11 and 13.0.0, a known parentId never got that 400, across every sort, filter and library type; 12.2 answers an unknown one the same way.

The same 400, in the same words, also answers two faults of the request itself: a `years` value that is not a whole number (`years=NaN`) and more `sortOrder` values than `sortBy` values. A 400 with validation details (`errors.parentId`) is a different case: a parentId that is not a GUID.

The neighbouring routes answer an unknown id their own way: `GET /Items/Latest` with 200 and nothing, `GET /Items/{id}` with 404, `GET /Shows/{id}/Episodes` with 404 and `"Series not found"` (or `"No season exists with Id …"` for a season that is gone), `GET /Shows/{id}/Seasons` with 404 problem details.

A library's id is a hash of its folder's path, so renaming a library gives it a new id, and two servers laid out alike give a library of the same name the same id ("Movies" is `f137a2dd…`). The old id keeps answering until the server forgets the old folder: on 10.11.11 and 12.2 a library refresh and 90 seconds did not do it, a restart did, and from then on the old id gets the 400. The app restores its query cache from disk for up to a day, so a library list from an earlier session keeps offering the old id until the fresh list lands.

## Symptom pattern

In Sentry, `400 GET /Items` with `http_response.body` `Error processing request.` under the keys `library-items`, `library-count` or `library-data`, and in the breadcrumbs a `404` on `GET /Items/<that library>` shortly before. `isStaleIdError` keeps these out of Sentry; it still reports the request that carries `years=NaN` or the extra sort orders.
