# Download Provider Migration Guide

## Overview

The DownloadProvider has been completely rewritten to use the new native `BackgroundDownloader` module instead of the third-party `@kesha-antonov/react-native-background-downloader` library.

## What Changed

### New Implementation

- **Native Module**: Uses our custom `BackgroundDownloader` Expo module built with NSURLSession
- **Simplified**: Focuses only on downloading video files
- **Background Support**: True iOS background downloads with system integration
- **Event-Driven**: Uses native event emitters for progress, completion, and errors

### Removed Features (For Now)

The following features from the old implementation have been temporarily removed to simplify the initial version:

- ✗ Trickplay image downloads
- ✗ Subtitle downloads
- ✗ Series primary image caching
- ✗ Intro/credit segment fetching
- ✗ Download queue management with concurrent limits
- ✗ Pause/Resume functionality
- ✗ Speed calculation and ETA
- ✗ Cache directory management

### Maintained Features

- ✓ Download video files with progress tracking
- ✓ Database persistence (same structure)
- ✓ Movies and Episodes support
- ✓ Download notifications
- ✓ File deletion and management
- ✓ Downloaded items listing
- ✓ Same context API

## API Compatibility

The public API remains mostly the same to avoid breaking existing code:

### Working Methods

```typescript
const {
  // Core functionality
  startBackgroundDownload,
  cancelDownload,
  
  // Database operations
  getDownloadedItems,
  getDownloadsDatabase,
  getDownloadedItemById,
  getDownloadedItemSize,
  
  // File management
  deleteFile,
  deleteItems,
  deleteAllFiles,
  
  // State
  processes,
  APP_CACHE_DOWNLOAD_DIRECTORY,
  appSizeUsage,
} = useDownload();
```

### Deprecated (No-op) Methods

These methods exist but do nothing in the new version:

- `startDownload()` - Use `startBackgroundDownload()` instead
- `pauseDownload()` - Not supported yet
- `resumeDownload()` - Not supported yet
- `deleteFileByType()` - Not needed (only video files)
- `cleanCacheDirectory()` - Not needed
- `updateDownloadedItem()` - Not needed
- `dumpDownloadDiagnostics()` - Not needed

## Migration Steps

### For Developers

1. **No code changes needed** if you're using `startBackgroundDownload()` and basic file management
2. **Remove calls** to deprecated methods (they won't break but do nothing)
3. **Test downloads** to ensure they work in your workflows

### For Users

- **No action required** - the new system uses the same database format
- **Existing downloads** will still be accessible
- **New downloads** will use the improved background system

## Future Enhancements

Planned features to add back:

1. **Pause/Resume**: Using NSURLSession's built-in pause/resume
2. **Queue Management**: Better control over concurrent downloads
3. **Trickplay**: Re-add trickplay image downloading
4. **Subtitles**: Download and link subtitle files
5. **Progress Persistence**: Resume downloads after app restart
6. **Cellular Control**: Respect cellular data settings
7. **Speed/ETA**: Better download metrics

## Database Structure

The database structure remains unchanged:

```typescript
interface DownloadsDatabase {
  movies: Record<string, DownloadedItem>;
  series: Record<string, DownloadedSeries>;
  other: Record<string, DownloadedItem>;
}

interface DownloadedItem {
  item: BaseItemDto;
  mediaSource: MediaSourceInfo;
  videoFilePath: string;
  videoFileSize: number;
  videoFileName?: string;
  trickPlayData?: TrickPlayData;
  introSegments?: MediaTimeSegment[];
  creditSegments?: MediaTimeSegment[];
  userData: UserData;
}
```

## Known Differences

1. **Progress Updates**: More frequent and accurate with native module
2. **Background Handling**: Better iOS background download support
3. **Error Messages**: Different error format from native module
4. **File Paths**: Uses `Paths.document` instead of cache directory
5. **No Queue**: Downloads start immediately (no queuing system yet)

## Troubleshooting

### Downloads not starting

- Check that the iOS app has been rebuilt with the new native module
- Verify network permissions
- Check console logs for errors

### Progress not updating

- Ensure event listeners are properly registered
- Check that the task ID mapping is correct
- Verify the download is still active

### Files not found

- Old downloads might be in a different location
- Re-download content if files are missing
- Check file permissions

## Old Implementation

The old implementation has been preserved at:
- `providers/DownloadProvider.deprecated.tsx`

You can reference it if needed, but it should not be used in production.

## Testing

After migration, test these scenarios:

- [ ] Download a movie
- [ ] Download an episode
- [ ] Download multiple items
- [ ] Cancel a download
- [ ] Delete a downloaded item
- [ ] View downloaded items list
- [ ] Background app during download
- [ ] Force quit and restart app
- [ ] Verify notifications appear
- [ ] Check file sizes are correct

## Questions?

If you encounter issues with the migration, please:
1. Check the console logs
2. Verify the native module is installed
3. Review the old implementation for reference
4. Open an issue with details

