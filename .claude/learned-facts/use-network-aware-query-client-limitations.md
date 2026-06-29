# useNetworkAwareQueryClient Limitations

**Date**: 2026-01-10
**Category**: state-management
**Key files**: `hooks/useNetworkAwareQueryClient.ts`

## Detail

**Updated 2026-06-29**: This limitation no longer applies. The hook was rewritten to use a `Proxy` (not `Object.create`). It overrides only `invalidateQueries` (network-aware) / `forceInvalidateQueries`, and binds every other method to the real `queryClient` target (`value.bind(target)`). So private-field methods like `getQueriesData`, `setQueryData`, and `removeQueries` work correctly through it now — no need to fall back to a separate `useQueryClient`. (Confirmed when adding `queryClient.removeQueries` to `clearAllJellyseerData` in `hooks/useJellyseerr.ts`.)

Historical (pre-2026-06): the hook used `Object.create(queryClient)`, which broke methods relying on JavaScript private fields; back then only `invalidateQueries` was safe.
