# Download System

This directory contains the types and utilities for the download system in Streamyfin.

## Architecture

### DownloadProvider

The `DownloadProvider` is a React context provider that manages all download operations in the app. It uses a custom native `BackgroundDownloader` module for iOS to enable true background downloads.

**Location**: `providers/DownloadProvider.tsx`

### Key Features

1. **Background Downloads**: Downloads continue even when app is backgrounded
2. **Progress Tracking**: Real-time progress updates via native events
3. **Persistent Storage**: Downloads are saved to device storage and tracked in a JSON database
4. **Type Safety**: Full TypeScript support with proper types
5. **Notifications**: System notifications for download completion/errors

### Database Structure

Downloads are persisted in MMKV storage with the key `downloads.v2.json`:

```typescript
interface DownloadsDatabase {
  movies: Record<string, DownloadedItem>;
  series: Record<string, DownloadedSeries>;
  other: Record<string, DownloadedItem>;
}
```

### Download Flow

1. **Start Download**
   ```typescript
   await startBackgroundDownload(url, item, mediaSource, maxBitrate);
   ```

2. **Track Progress**
   - Native module emits progress events
   - Provider updates `processes` state
   - UI reflects current progress

3. **Handle Completion**
   - File is moved to permanent location
   - Database is updated
   - User receives notification
   - Process is cleaned up

4. **Error Handling**
   - Errors are caught and logged
   - User receives error notification
   - Process is marked as failed and removed

## Types

### JobStatus

Represents an active download job:

```typescript
type JobStatus = {
  id: string;                    // Item ID
  inputUrl: string;              // Download URL
  item: BaseItemDto;             // Jellyfin item
  itemId: string;                // Item ID
  deviceId: string;              // Device identifier
  progress: number;              // 0-100
  status: DownloadStatus;        // Current status
  timestamp: Date;               // Created/updated time
  mediaSource: MediaSourceInfo;  // Media source info
  maxBitrate: Bitrate;          // Selected bitrate
  bytesDownloaded?: number;      // Bytes downloaded
  lastProgressUpdateTime?: Date; // Last update time
};
```

### DownloadedItem

Represents a completed download in the database:

```typescript
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

## Usage Examples

### Basic Download

```typescript
import { useDownload } from '@/providers/DownloadProvider';

function MyComponent() {
  const { startBackgroundDownload } = useDownload();

  const handleDownload = async () => {
    await startBackgroundDownload(
      downloadUrl,
      jellyfinItem,
      mediaSource,
      selectedBitrate
    );
  };
}
```

### Monitor Progress

```typescript
function DownloadsList() {
  const { processes } = useDownload();

  return (
    <View>
      {processes.map(process => (
        <ProgressBar 
          key={process.id}
          progress={process.progress}
          title={process.item.Name}
        />
      ))}
    </View>
  );
}
```

### List Downloaded Items

```typescript
function DownloadedList() {
  const { getDownloadedItems } = useDownload();
  const items = getDownloadedItems();

  return (
    <FlatList
      data={items}
      renderItem={({ item }) => (
        <ItemCard item={item.item} />
      )}
    />
  );
}
```

### Delete Downloads

```typescript
function DeleteButton({ itemId }: { itemId: string }) {
  const { deleteFile } = useDownload();

  const handleDelete = async () => {
    await deleteFile(itemId);
  };

  return <Button onPress={handleDelete} title="Delete" />;
}
```

## File Storage

Downloads are stored in the app's Documents directory:

```
Documents/
  └── [filename].mp4
```

Filenames are generated based on item type:
- Movies: `{title}_{year}.mp4`
- Episodes: `{series}_s{season}e{episode}.mp4`

## Native Module Integration

The provider uses the `BackgroundDownloader` native module:

```typescript
import { BackgroundDownloader } from '@/modules';

// Start download
const taskId = await BackgroundDownloader.startDownload(url, destPath);

// Listen for events
BackgroundDownloader.addProgressListener(event => {
  // Handle progress
});

BackgroundDownloader.addCompleteListener(event => {
  // Handle completion
});

BackgroundDownloader.addErrorListener(event => {
  // Handle error
});
```

## Platform Support

- **iOS**: Full support with background downloads
- **Android**: Planned
- **tvOS**: Disabled (returns no-op functions)

## Migration

If upgrading from the old download system, see [MIGRATION.md](./MIGRATION.md) for details.

## Future Improvements

- [ ] Add pause/resume functionality
- [ ] Implement download queue with concurrent limits
- [ ] Add trickplay image downloads
- [ ] Add subtitle downloads
- [ ] Add intro/credit segment detection
- [ ] Persist downloads across app restarts
- [ ] Add cellular data controls
- [ ] Improve download speed calculation
- [ ] Add download size estimates

