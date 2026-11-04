# A Polling Query Rewrites the Whole Persisted Cache on Every Tick

**Date**: 2026-11-02
**Category**: state-and-data
**Key files**: `utils/log.tsx`, `utils/queryPersistence.ts`, `node_modules/@tanstack/query-persist-client-core/src/persist.ts`

## Detail

A query with `refetchInterval` under `PersistQueryClientProvider` re-serializes the entire persisted query cache into MMKV on every tick, even when the data never changes. Each fetch emits `updated` cache events, and `persistQueryClientSubscribe` (`persist.ts`) saves the whole dehydrated client on every cache event, not only the one that changed.

`LogProvider` did this for every user. It sits in `app/_layout.tsx` for the whole session and polled `["logs"]` once a second, so the cache was written about once a second whether or not anyone was looking at the logs. The query was also persisted itself, because `queryDehydrateOptions` persisted anything with `gcTime !== 0` at the time. It now persists only the families in `PERSISTED_QUERY_FAMILIES` (`constants/QueryPersistence.ts`) and still excludes `gcTime: 0`.

The allowlist alone does not remove the cost: the `updated` event fires for every query, persisted or not, and each one saves the whole dehydrated client. `withoutRedundantSaves` (`utils/queryPersistence.ts`) skips a save when no persisted query's data or invalidation changed, so the Sessions badge's 5 s poll of `["sessions"]`, which is not persisted, no longer writes. A poll on an allowlisted query still rewrites the whole cache on every tick, just as the `["logs"]` poll did. A poll must run only while something reads it, and one that is not allowlisted must still set `gcTime: 0` so nobody adds it to the list by accident. `LogProvider` enables the `["logs"]` query only while a `useLog()` consumer is focused, and `utils/useLog.test.tsx` pins both.
