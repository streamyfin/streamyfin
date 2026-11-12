# Background Downloader Module

A native iOS and Android module for downloading large files in the background using `NSURLSession` (iOS) and an OkHttp transfer in a foreground service (Android).

## Features

- **Background Downloads**: Downloads continue even when the app is backgrounded or suspended
- **Progress Tracking**: Real-time progress updates via events
- **Multiple Downloads**: Support for concurrent downloads
- **Cancellation**: Cancel individual or all downloads
- **Pause and resume**: Pause a download and continue it later from the byte it stopped at, where the server allows
- **Custom Destination**: Optionally specify custom file paths
- **Error Handling**: Comprehensive error reporting
- **Cross-Platform**: Works on both iOS and Android

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

Cancels all active downloads, queued and paused ones included.

#### `pauseDownload(taskId: number): Promise<'kept' | 'discarded' | 'failed'>`

Stops a running download. `kept`: its bytes are saved and resuming continues from them.
`discarded`: stopped, but resuming starts from the first byte, which is the case for transcodes
(streamed as the server makes them) and servers without range requests. `failed`: there was no
such transfer, usually because it had just finished.

A paused download holds the queue: nothing queued behind it starts until it is resumed or
cancelled. Pausing is how a user stops all transfers, for instance when leaving Wi-Fi.

#### `resumeDownload(itemId, url, destinationPath?, metadata?, headers?): Promise<number>`

Continues a paused download and resolves with its new task id. Takes what the download was
enqueued with, so it also works when native no longer knows of the pause.

- **iOS:** the URLSession resume data, kept in Application Support and surviving an app kill.
- **Android:** a `Range` request onto the `.part` file, with `If-Range` set to the first
  response's `ETag` or `Last-Modified`. A `200` answer starts the file over; a `416` restarts it.

#### `cancelPausedDownload(itemId: string, destinationPath?: string): void`

Drops a paused download and the bytes it saved, and lets the queue move on.

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
  taskId: number; // -1 for queued and paused entries
  url: string;
  itemId?: string;
  destinationPath?: string;
  state?: 'running' | 'queued' | 'paused';
}
```

## Implementation Details

### iOS Background Downloads

- Uses `NSURLSession` with background configuration
- Session identifier: `com.fredrikburmester.streamyfin.backgrounddownloader`
- Downloads continue when app is backgrounded or suspended
- System may terminate downloads if app is force-quit

### Android Background Downloads

- Streams with OkHttp into a `.part` file inside a `dataSync` foreground service, renamed into
  place when complete
- Shows a download notification while a transfer runs; a paused download releases it
- Queue and pauses live in memory: after a process death JS re-enqueues, and a resume still finds
  the `.part` file
- Requires `INTERNET` permission (automatically added by Expo)

### Background Modes

The app's `Info.plist` already includes the required background mode for iOS:

- `UIBackgroundModes`: `["audio", "fetch"]`

### File Storage

**iOS:** By default, downloaded files are saved to the app's Documents directory.

**Android:** By default, files are saved to the app's external files directory (accessible via `FileSystem.documentDirectory` in Expo).

You can specify a custom path using the `destinationPath` parameter on both platforms.

## Building

After adding this module, rebuild the app:

```bash
# iOS
npx expo prebuild -p ios
npx expo run:ios

# Android
npx expo prebuild -p android
npx expo run:android
```

Or install manually:

```bash
# iOS
cd ios
pod install
cd ..

# Android - prebuild handles everything
npx expo prebuild -p android
```

## Notes

- Background downloads may be cancelled if the user force-quits the app (iOS)
- The OS manages download priority and may pause downloads to save battery
- Android shows a system notification for ongoing downloads
- Downloads over cellular are allowed by default on both platforms
