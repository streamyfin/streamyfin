# Background Downloader Module

A native iOS module for downloading large files in the background using `NSURLSession` with background configuration.

## Features

- **Background Downloads**: Downloads continue even when the app is backgrounded or suspended
- **Progress Tracking**: Real-time progress updates via events
- **Multiple Downloads**: Support for concurrent downloads
- **Cancellation**: Cancel individual or all downloads
- **Custom Destination**: Optionally specify custom file paths
- **Error Handling**: Comprehensive error reporting

## Usage

### Basic Example

```typescript
import { BackgroundDownloader } from '@/modules';

// Start a download
const taskId = await BackgroundDownloader.startDownload(
  'https://example.com/largefile.mp4'
);

// Listen for progress updates
const progressSub = BackgroundDownloader.addProgressListener((event) => {
  console.log(`Progress: ${Math.floor(event.progress * 100)}%`);
  console.log(`Downloaded: ${event.bytesWritten} / ${event.totalBytes}`);
});

// Listen for completion
const completeSub = BackgroundDownloader.addCompleteListener((event) => {
  console.log('Download complete!');
  console.log('File saved to:', event.filePath);
  console.log('Task ID:', event.taskId);
});

// Listen for errors
const errorSub = BackgroundDownloader.addErrorListener((event) => {
  console.error('Download failed:', event.error);
});

// Cancel a download
BackgroundDownloader.cancelDownload(taskId);

// Get all active downloads
const activeDownloads = await BackgroundDownloader.getActiveDownloads();

// Cleanup listeners when done
progressSub.remove();
completeSub.remove();
errorSub.remove();
```

### Custom Destination Path

```typescript
import { BackgroundDownloader } from '@/modules';
import * as FileSystem from 'expo-file-system';

const destinationPath = `${FileSystem.documentDirectory}myfile.mp4`;
const taskId = await BackgroundDownloader.startDownload(
  'https://example.com/video.mp4',
  destinationPath
);
```

### Managing Multiple Downloads

```typescript
import { BackgroundDownloader } from '@/modules';

const downloads = new Map();

async function startMultipleDownloads(urls: string[]) {
  for (const url of urls) {
    const taskId = await BackgroundDownloader.startDownload(url);
    downloads.set(taskId, { url, progress: 0 });
  }
}

// Track progress for each download
const progressSub = BackgroundDownloader.addProgressListener((event) => {
  const download = downloads.get(event.taskId);
  if (download) {
    download.progress = event.progress;
  }
});

// Cancel all downloads
BackgroundDownloader.cancelAllDownloads();
```

## API Reference

### Methods

#### `startDownload(url: string, destinationPath?: string): Promise<number>`

Starts a new background download.

- **Parameters:**
  - `url`: The URL of the file to download
  - `destinationPath`: (Optional) Custom file path for the downloaded file
- **Returns:** Promise that resolves to the task ID (number)

#### `cancelDownload(taskId: number): void`

Cancels a specific download by task ID.

- **Parameters:**
  - `taskId`: The task ID returned by `startDownload`

#### `cancelAllDownloads(): void`

Cancels all active downloads.

#### `getActiveDownloads(): Promise<ActiveDownload[]>`

Gets information about all active downloads.

- **Returns:** Promise that resolves to an array of active downloads

### Event Listeners

#### `addProgressListener(listener: (event: DownloadProgressEvent) => void): Subscription`

Listens for download progress updates.

- **Event payload:**
  - `taskId`: number
  - `bytesWritten`: number
  - `totalBytes`: number
  - `progress`: number (0.0 to 1.0)

#### `addCompleteListener(listener: (event: DownloadCompleteEvent) => void): Subscription`

Listens for download completion.

- **Event payload:**
  - `taskId`: number
  - `filePath`: string
  - `url`: string

#### `addErrorListener(listener: (event: DownloadErrorEvent) => void): Subscription`

Listens for download errors.

- **Event payload:**
  - `taskId`: number
  - `error`: string

#### `addStartedListener(listener: (event: DownloadStartedEvent) => void): Subscription`

Listens for download start confirmation.

- **Event payload:**
  - `taskId`: number
  - `url`: string

## Types

```typescript
interface DownloadProgressEvent {
  taskId: number;
  bytesWritten: number;
  totalBytes: number;
  progress: number;
}

interface DownloadCompleteEvent {
  taskId: number;
  filePath: string;
  url: string;
}

interface DownloadErrorEvent {
  taskId: number;
  error: string;
}

interface DownloadStartedEvent {
  taskId: number;
  url: string;
}

interface ActiveDownload {
  taskId: number;
  url: string;
  state: 'running' | 'suspended' | 'canceling' | 'completed' | 'unknown';
}
```

## Implementation Details

### iOS Background Downloads

- Uses `NSURLSession` with background configuration
- Session identifier: `com.fredrikburmester.streamyfin.backgrounddownloader`
- Downloads continue when app is backgrounded or suspended
- System may terminate downloads if app is force-quit

### Background Modes

The app's `Info.plist` already includes the required background mode:

- `UIBackgroundModes`: `["audio", "fetch"]`

### File Storage

By default, downloaded files are saved to the app's Documents directory. You can specify a custom path using the `destinationPath` parameter.

## Building

After adding this module, rebuild the iOS app:

```bash
npx expo prebuild -p ios
npx expo run:ios
```

Or install pods manually:

```bash
cd ios
pod install
cd ..
```

## Notes

- Background downloads may be cancelled if the user force-quits the app
- The OS manages download priority and may pause downloads to save battery
- Downloads over cellular can be disabled in the module configuration if needed
