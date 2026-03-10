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
