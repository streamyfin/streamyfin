## Round 2 Review

**Commit:** `db7c7e24` fix(downloads): address code review — SAF URI safety, integrity check, async cleanup  
**Reviewer:** Jarvis (AI)  
**Date:** 2026-03-10  
**Verdict:** ⚠️ **Needs 1 fix** before build — unawaited async calls. Everything else is solid.

---

### Verification of Round 1 Fixes

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1 | `deleteVideoFile()` crash on SAF URIs | ✅ Fixed | `isSafUri()` guard added, routes to `deleteSafFile()` for `content://` URIs. Clean early return. |
| 2 | No integrity check before deleting original | ✅ Fixed | `getInfoAsync` on both source and SAF copy, size comparison before delete. Falls back to keeping both copies on mismatch or error. Solid. |
| 3 | Player handling of `content://` URIs | ✅ Fixed (design change) | `videoFilePath` is now set to the SAF URI **only** when the app-private copy was successfully removed. The player code at `direct-player.tsx:266` receives whatever URI is in `videoFilePath`. VLC on Android does handle `content://` URIs natively, so this should work. The fallback (`safFilePath ?? file://` path) ensures a URI is always present. |
| 4 | URI name extraction broken (`%3A` vs `:`) | ✅ Fixed | `storagePath.ts:41` now splits on `:` after decoding. Correct. |
| 5 | `downloadPath` reactivity mid-download | ✅ Addressed | Comment added in event handler noting `downloadPath` reflects setting at completion time. Acceptable for v1. |
| 6 | Fire-and-forget async SAF delete | ✅ Fixed | `deleteAllAssociatedFiles` is now `async`, awaits `deleteSafFile`. SAF cleanup is also separated: if `safFilePath !== videoFilePath`, it's deleted independently. |
| 7 | Duplicate filename on repeated SAF copies | ⚠️ Noted | Not directly fixed — Android still appends `(1)`, `(2)` etc. Acceptable as a known limitation for v1. Old SAF copies will accumulate if user re-downloads. |
| 8 | `isVerifying` state / disabled button | ✅ Fixed | `disabled={isVerifying}` added to the "Change Location" button. Clean. |

**Round 1 score: 7/8 fixed, 1 acknowledged as known limitation.**

---

### 🔴 NEW Issue Found

#### N1. `deleteAllAssociatedFiles` is async but callers don't `await` it

**File:** `providers/Downloads/hooks/useDownloadOperations.ts` — lines 199, 228, 257

`deleteAllAssociatedFiles` was changed from sync to `async` (returning `Promise<void>`), but **all three call sites** still call it without `await`:

```ts
// Line 199 — deleteFile()
deleteAllAssociatedFiles(itemToDelete);  // ← not awaited

// Line 228 — deleteAllFiles()
deleteAllAssociatedFiles(item);  // ← not awaited

// Line 257 — deleteFileByType()
deleteAllAssociatedFiles(item);  // ← not awaited
```

**Impact:**
1. The `try/catch` blocks around these calls **will not catch** promise rejections — they'll become unhandled rejections
2. `toast.success()` fires immediately, before SAF files are actually deleted
3. In `deleteAllFiles` and `deleteFileByType`, the `for` loop doesn't wait for each deletion before starting the next, potentially causing race conditions with rapid sequential deletes

**Fix:** Add `await` to all three calls:
```ts
await deleteAllAssociatedFiles(itemToDelete);
```

The containing functions are already `async`, so this is a one-word fix per call site.

---

### Fresh Review Findings (Beyond Round 1)

#### ✅ `FileSystemLegacy.getInfoAsync` on SAF `content://` URIs
Expo-file-system (v19, SDK 54) supports `content://` URIs in `getInfoAsync` on Android. The `size` field is available when the SAF provider supports it, which is the case for `com.android.externalstorage`. The `"size" in safInfo` guard handles the edge case where it might not be present. **No issue.**

#### ✅ `FileSystemLegacy.copyAsync` with `content://` destination
`copyAsync({ from: "file://...", to: "content://..." })` is supported in expo-file-system on Android. The native implementation delegates to Android's `ContentResolver.openOutputStream`, which works with SAF URIs. **No issue.**

#### ✅ Race condition in `effectiveFilePath` logic
The check `new File(filePathToUri(event.filePath)).exists` happens synchronously right after the potential `appPrivateFile.delete()` call. Since this is single-threaded JS and the delete is synchronous (expo-file-system `File.delete()` is sync), there's no race. The `exists` check will correctly reflect whether the file was deleted. **No issue.**

#### ✅ Settings page integration
`<DownloadSettings />` is imported as a default import, placed correctly before `<StorageSettings />`, wrapped in `{!Platform.isTV && ...}`. Import path resolves. **No issue.**

#### ✅ `useEffect` dependency array
`downloadPath` is included in the dependency array at line 389. `FileSystemLegacy` is a module-level import (not a closure variable), so it's always the same reference — no stale closure issue. **No issue.**

#### ✅ TypeScript type narrowing
The `"size" in safInfo && "size" in sourceInfo` checks are proper type narrowing for the `FileInfo` union type (`{ exists: true, size: number, ... } | { exists: false }`). The `exists` check comes first. **No issue.**

#### ⚠️ Minor: `getInfoAsync` on deleted file
In the `effectiveFilePath` logic (line 323-327), `new File(filePathToUri(event.filePath)).exists` is used to check if the app-private copy still exists. This uses the new `expo-file-system` `File` API, not the legacy API. This is fine and consistent with how `File` is used elsewhere. No concern.

---

### Overall Assessment

The fix commit (`db7c7e24`) is well-crafted. It addresses the critical and major issues from round 1 with appropriate solutions:
- SAF URI detection via `isSafUri()` is clean and used consistently
- Integrity verification with size comparison is the right approach
- The decision to keep `videoFilePath` as the app-private path when available (and only falling back to SAF) is correct
- Error handling throughout is defensive and appropriate

**The only blocker is N1** — three missing `await` keywords in `useDownloadOperations.ts`. This is a quick fix.

**Verdict: Add `await` to the three `deleteAllAssociatedFiles` calls, then ready to build the APK.**

---

---

# Code Review: Configurable Download Path (SAF)

**Branch:** `feature/configurable-download-path`  
**Commits:** `b124d77c` feat, `d5a2693a` fix  
**Reviewer:** Jarvis (AI)  
**Date:** 2026-03-10  
**Verdict:** ⚠️ **Needs Changes** — 2 critical issues, several major/minor

---

## Summary

Adds Android Storage Access Framework (SAF) support so users can choose an external download directory (e.g., for VR video players to access). After download completes, files are copied from app-private storage to the SAF directory, then the app-private copy is deleted. Settings UI is clean, Android-only guarded, and i18n is done properly.

The overall approach is sound and the code is well-structured. However, there are **critical issues** around file deletion safety and how `videoFilePath` interacts with the existing codebase when it contains a `content://` URI instead of a `file://` URI.

---

## 🔴 Critical Issues

### 1. `deleteVideoFile()` will crash on SAF URIs
**File:** `providers/Downloads/fileOperations.ts:10-19`  
**File:** `providers/Downloads/hooks/useDownloadEventHandlers.ts:298`

When SAF is used, `effectiveFilePath` (a `content://` URI) is stored as `videoFilePath`. Later, when a user deletes the download, `deleteAllAssociatedFiles()` calls `deleteVideoFile(item.videoFilePath)`, which does:

```ts
const videoFile = new File(filePathToUri(filePath));
```

`filePathToUri()` (in `utils.ts:39-44`) blindly prepends `file://` if not already present, turning `content://com.android.externalstorage/...` into `file://content://com.android.externalstorage/...` — an invalid URI. The `expo-file-system` `File` constructor does not support `content://` URIs.

**The delete path already handles SAF separately via `item.safFilePath`**, but `deleteVideoFile()` is still called on `item.videoFilePath` first and will throw.

**Fix:** Guard `deleteVideoFile()` against `content://` URIs, or don't overwrite `videoFilePath` with the SAF URI. Consider keeping `videoFilePath` empty/sentinel when the file lives only in SAF storage, and using `safFilePath` as the source of truth for playback.

### 2. Delete-before-verify: No integrity check on SAF copy
**File:** `providers/Downloads/hooks/useDownloadEventHandlers.ts:272-290`

After `copyFileToSaf()` succeeds, the app-private copy is immediately deleted without verifying the SAF copy is valid (e.g., file size matches). If the copy is truncated or corrupted (storage full mid-write, SAF provider bug, etc.), the user loses the file entirely.

```ts
// Current: copy succeeds → delete original immediately
const safUri = await copyFileToSaf(...);
if (safUri) {
  safFilePath = safUri;
  // ... immediately deletes original
  appPrivateFile.delete();
}
```

**Fix:** After copy, read the SAF file info (`FileSystemLegacy.getInfoAsync(safUri)`) and compare `size` against the source file size before deleting. If sizes don't match, keep the original and log a warning.

---

## 🟠 Major Issues

### 3. `videoFilePath` as SAF URI breaks playback assumptions
**File:** `app/(auth)/player/direct-player.tsx:266`

The player reads `downloadedItem.videoFilePath` directly as the playback URL. VLC and MPV native players may or may not handle `content://` URIs on Android. This needs verification — if they expect `file://` URIs, playback of SAF-stored downloads will fail silently or crash.

If `content://` works for playback, document it. If not, you may need to keep a separate field or use the SAF URI only for external access and keep a local symlink/reference for playback.

### 4. URI name extraction is fragile
**File:** `providers/Downloads/storagePath.ts:39-42`

```ts
const decoded = decodeURIComponent(uri);
const name =
  decoded.split("%3A").pop()?.split("/").pop() ||
  decoded.split("/").pop() ||
  "Selected Folder";
```

The URI is already `decodeURIComponent()`'d, so splitting on `%3A` (encoded colon) will never match — it's now a literal `:` in the decoded string. This means the first branch always falls through to `decoded.split("/").pop()`, which returns the full last path segment (often a long encoded string, not a clean folder name).

**Fix:** Split on `:` after decoding, or don't decode before splitting on `%3A`:
```ts
const name = decoded.split(":").pop()?.split("/").pop() || "Selected Folder";
```

### 5. `downloadPath` reactivity in `useDownloadEventHandlers`
**File:** `providers/DownloadProvider.tsx:32`, `providers/Downloads/hooks/useDownloadEventHandlers.ts:350`

`downloadPath` is read from `settings` in the provider, passed as a prop to `useDownloadEventHandlers`, and included in the `useEffect` dependency array. If the user changes the download path mid-download, the `useEffect` will re-run and re-register event listeners with the new path. However, in-flight downloads that complete after the change will use the *new* path, not the one that was active when the download started.

This is probably fine for most cases but is worth documenting or, ideally, capturing `downloadPath` at download-start time in the job metadata.

### 6. `deleteAllAssociatedFiles` calls fire-and-forget async in a sync function
**File:** `providers/Downloads/fileOperations.ts:78-82`

```ts
if (item.safFilePath) {
  deleteSafFile(item.safFilePath).catch((error) => {
    console.error("[DELETE] Failed to delete SAF copy:", error);
  });
}
```

This is fine for cleanup, but the caller (`useDownloadOperations`) may show a success toast before the SAF deletion actually completes (or fails). If SAF deletion fails, the user thinks the file is deleted but it still exists in external storage. Consider making `deleteAllAssociatedFiles` async and awaiting SAF deletion.

---

## 🟡 Minor Issues

### 7. Missing `type` import for `Settings`
**File:** `providers/Downloads/hooks/useDownloadEventHandlers.ts:13`

```ts
import type { Settings } from "@/utils/atoms/settings";
```

✅ This is correct — uses `type` import. Good.

### 8. Duplicate filename on repeated SAF copies
**File:** `providers/Downloads/storagePath.ts:88-92`

`StorageAccessFramework.createFileAsync` will create a new file each time, even if one with the same name exists (Android appends ` (1)`, ` (2)`, etc.). If a user re-downloads the same episode, old SAF copies won't be cleaned up unless the previous `safFilePath` was tracked and deleted.

This is a minor leak — not critical, but worth noting in documentation or adding a check.

### 9. `isVerifying` state never shown as loading indicator
**File:** `components/settings/DownloadSettings.tsx:94-100`

The `isVerifying` state shows as a subtitle text "Verifying access..." but there's no visual loading indicator (spinner, disabled state). The user might tap "Change Location" again during verification. Consider disabling the button while verifying.

### 10. Commit messages are good
Both commits follow conventional commits format:
- `feat(downloads): add configurable download path via SAF`
- `fix(downloads): remove app-private copy after SAF transfer to avoid doubling storage`

✅ Correct scope and format.

---

## ✅ Things That Look Good

1. **Platform guarding** — Android-only code properly guarded with `Platform.OS !== "android"` checks in both the UI component and the SAF utility functions
2. **i18n** — All user-facing strings use translation keys with sensible defaults, keys follow existing `home.settings.downloads.*` naming pattern
3. **Settings atom** — `downloadPath` added cleanly to the `Settings` type with proper optional/null typing and default value
4. **Import style** — Correct use of `type` imports, path aliases (`@/`), consistent with codebase
5. **Error handling** — Good try/catch pattern in SAF operations with console logging and user-facing toast messages
6. **TV exclusion** — `{!Platform.isTV && <DownloadSettings />}` correctly hides from TV builds
7. **Clean component structure** — `DownloadSettings` follows existing patterns (ListGroup/ListItem), uses `useCallback` for handlers
8. **SAF module isolation** — `storagePath.ts` is a clean, well-documented module with single-responsibility functions
9. **MMKV persistence** — Settings flow through existing Jotai atom → MMKV pipeline correctly
10. **Type additions** — `safFilePath` on `DownloadedItem` is properly optional with JSDoc

---

## Recommendations

1. **Don't set `videoFilePath` to SAF URI** — keep it as the app-private path (or empty), add `safFilePath` as the playback source when available. Update player code to prefer `safFilePath` over `videoFilePath` on Android.
2. **Add file size verification** before deleting the app-private copy after SAF transfer.
3. **Fix the URI name parsing** — split on `:` not `%3A` after decoding.
4. **Verify VLC/MPV player support** for `content://` URIs before merging.
5. **Consider making `deleteAllAssociatedFiles` async** to properly await SAF cleanup.
6. **Add a brief comment** in the event handler noting that `downloadPath` reflects the setting at completion time, not download-start time.

---

*Review generated with AI assistance (Claude). All file references verified against the actual diff.*
