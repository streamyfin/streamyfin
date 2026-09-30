# Background Downloader Module

A native iOS and Android module for downloading large files in the background using `NSURLSession` (iOS) and `DownloadManager` (Android).

## Features

- **Background Downloads**: Downloads continue even when the app is backgrounded or suspended
- **Progress Tracking**: Real-time progress updates via events
- **Multiple Downloads**: Support for concurrent downloads
- **Cancellation**: Cancel individual or all downloads
- **Custom Destination**: Optionally specify custom file paths
- **Error Handling**: Comprehensive error reporting
- **Cross-Platform**: Works on both iOS and Android

## Multi-track transcoded downloads

For an individual movie or episode, the download sheet can retain additional audio
tracks. Selecting extras opts into an H.264/AAC download assembled as one seekable
MKV. All selected audio is converted to **128 kbps AAC, up to stereo**, including the
primary track; this is a size-saving mode, not preservation of surround/Atmos or
the original audio bitstreams. Mono tracks remain mono. Ordinary single-track and season downloads retain
their existing behavior.

Stock Jellyfin's audio-only endpoint currently ignores the requested audio index
([jellyfin/jellyfin#17436](https://github.com/jellyfin/jellyfin/issues/17436)).
The temporary workaround negotiates each additional track through the video
endpoint with a tiny, low-frame-rate H.264 carrier. The server must decode and
encode that carrier, and its bytes are transferred, but **none of those extra video
tracks enter the final MKV**. The full-quality video is downloaded only once.
The TODO in `utils/jellyfin/media/multiTrackDownload.ts` tracks replacing this
workaround with audio-only requests once supported servers honor the index.
Do not remove it for affected server versions merely because an upstream patch
has merged.

The native job owns the sequential transfers and packet-copy remux, not the JS
runtime. A download is not available offline until the final MKV has been closed
and atomically published. Completed input files survive an interrupted job;
**Retry** reuses them and **Cancel** removes the job's temporary files. Extra disk
space is needed while the inputs and final output coexist.

On Android, a foreground-service notification covers downloading and preparation.
On iOS 26+, user-started continued processing can cover both stages. iOS may
interrupt that work; older iOS versions and sessions without continued-processing
permission finish preparation when the app is foregrounded. “Preparing download”
is not a completion notification.

Text subtitles retain the existing sidecar download behavior. A selected
image-based subtitle is burned into the main video and cannot be switched off.
This first version does not embed subtitle files or fonts into the MKV.
Downloads remain unavailable on TV.

The feature requires a rebuilt native app; the extra-track picker is hidden when
running a binary without the multi-track native API.

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

### Android Background Downloads

- Uses Android's `DownloadManager` API
- Downloads are managed by the system and continue in the background
- Shows download notification in the notification tray
- Downloads continue even if the app is closed
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
