# A Query Nobody Observes Reports Its First Failure

**Date**: 2026-10-09
**Category**: state-and-data
**Key files**: `node_modules/@tanstack/query-core/build/modern/query.js` (`removeObserver`), `utils/reportDataError.ts`, `hooks/useLibraryFilters.ts`

## Detail

The default `retry` in `app/_layout.tsx` gives a failing query three more attempts, 1, 2 and 4 seconds apart, before `QueryCache.onError` runs and `reportDataError` sends the error to Sentry. That only holds while something observes the query. When the last observer leaves, `Query.removeObserver` calls `retryer.cancelRetry()`: the request already in flight is left to finish, and if it fails, that failure is final. It is reported at once, with no retry.

A query loses its observer without the screen going away whenever its key changes: the observer moves to the new key and the old query is left running with nobody reading it. So a screen that renders once with one key and then with another reports every failure of the first request, including the passing kind an observed query would have absorbed on its second attempt.

The library screen did this on every open. It built its key from the shared filter atoms and wrote its own selection into them in a focus effect, so the first render fetched with whatever the atoms held (their initial values, or the previous library's genres, years and sort) and the second with its own. `useLibraryFilters` now holds the query back until the atoms are the screen's.

## Symptom pattern

In the breadcrumbs of a handled query error, one failing request and the event a millisecond or two later, where a retried query would show four failing requests spread over seven seconds. That is an abandoned query: look for a key that changes right after mount, not for a request the screen is waiting on.
