# Keychain Read Throws on a Locked Phone

**Date**: 2026-10-06
**Category**: native-modules
**Key files**: `utils/customHeaders/secureValues.ts`, `utils/customHeaders/resolve.ts`, `test-utils/secureStore.ts`

## Detail

iOS can launch the app in the background while the phone is locked. On such a
launch the Keychain refuses every item stored with the default accessibility
(readable when unlocked), and `expo-secure-store` turns that into a thrown
`KeyChainException: User interaction is not allowed`, from `getItem` and
`getItemAsync` alike. `SecureStore.getItem` is synchronous, so when it is
called during render the throw takes the component down: with the header
resolvers that was `JellyfinProvider`, and so the whole tree.

Two things about the fix that are not in the documentation:

- `keychainAccessible` only takes on an item being created. `set` in
  `ios/SecureStoreModule.swift` falls back to `update` on a duplicate, and
  `update` writes `kSecValueData` and nothing else, so saving over an existing
  item keeps the accessibility it was created with. Changing it means deleting
  the item and adding it again.
- Lookups do not include the accessibility, so an item is found whatever it
  was stored with.

A read that returns empty instead of throwing must not be treated as the
stored value. Anything that caches it, writes it back, or sends a request
without it turns a locked phone into lost data or a lost session: a gateway's
401 or 403 for the missing header is read as the server ending the session.
`trackSecureReads` is how a caller learns the difference.

## Symptom pattern

A crash or an unhandled rejection in the first seconds after app start, with
`in_foreground: false` in the Sentry app context, from a build that works
every time it is opened by hand.
