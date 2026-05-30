# useNetworkAwareQueryClient Limitations

**Date**: 2026-01-10
**Category**: state-management
**Key files**: `hooks/useNetworkAwareQueryClient.ts`

## Detail

The `useNetworkAwareQueryClient` hook uses `Object.create(queryClient)` which breaks QueryClient methods that use JavaScript private fields (like `getQueriesData`, `setQueriesData`, `setQueryData`). Only use it when you ONLY need `invalidateQueries`. For cache manipulation, use standard `useQueryClient` from `@tanstack/react-query`.
