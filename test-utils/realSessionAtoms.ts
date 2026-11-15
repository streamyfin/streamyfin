/**
 * `@/providers/JellyfinProvider` holding only the real session atoms of
 * `@/utils/atoms/api`, for a spec that seeds the session and reads it back
 * through the provider. Not wired: a spec mocks the provider with it. The
 * provider double with `makeApi()` atoms is `jellyfinProviderModule` in
 * `test-utils/jellyfinProvider.ts`.
 */
export { apiAtom, userAtom } from "../utils/atoms/api";
