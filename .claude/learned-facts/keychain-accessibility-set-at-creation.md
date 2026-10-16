# Keychain Accessibility Is Set at Creation

**Date**: 2026-10-06
**Category**: native-modules
**Key files**: `utils/customHeaders/secureValues.ts` (`WRITE_OPTIONS`, `recreateLegacySecureValues`), `test-utils/secureStore.ts`

## Detail

iOS can launch the app in the background while the phone is locked. On such a
launch the Keychain refuses every item stored with the default accessibility
(readable when unlocked), and `expo-secure-store` turns that into a thrown
`KeyChainException: User interaction is not allowed`, from `getItem` and
`getItemAsync` alike. `getItem` is synchronous, so called during render the
throw takes the component down.

Passing `keychainAccessible` to `setItem` does not fix an item that already
exists. `set` in `ios/SecureStoreModule.swift` falls back to `update` on a
duplicate, and `update` writes `kSecValueData` and nothing else: the item keeps
the accessibility it was created with. Changing it means creating a new item,
which is why the header values are moved to new keys rather than saved again.

Lookups do not include the accessibility, so an item is found whatever it was
stored with, and nothing in the API says which one that was. The key prefix
carries that instead.

## Symptom pattern

A crash or an unhandled rejection in the first seconds after app start, with
`in_foreground: false` in the Sentry app context, from a build that works
every time it is opened by hand.
