# Downloads Module

This module handles all download functionality for the Streamyfin app, including video downloads, subtitles, trickplay images, and cover images.

## Architecture

The downloads module is structured with a clean separation of concerns:

### Core Files

- **`database.ts`** - Pure functions for MMKV database operations
- **`fileOperations.ts`** - Pure functions for file system operations
- **`utils.ts`** - Pure utility functions (filename generation, URI conversion)
- **`additionalDownloads.ts`** - Pure functions for downloading additional assets
- **`notifications.ts`** - Pure functions for notification handling
- **`types.ts`** - TypeScript type definitions

### Hooks

- **`useDownloadOperations.ts`** - Hook providing download operations (start, cancel, delete)
- **`useDownloadEventHandlers.ts`** - Hook setting up native download event listeners

### Main Provider

- **`DownloadProvider.tsx`** - React context provider that orchestrates all download functionality

## Features

### Video Downloads
- Background download support using native module
- Progress tracking and reporting
- Pause/resume capability (future enhancement)
- Download queue management

### Additional Assets (Automatic)
When a video download completes, the following are automatically downloaded:

1. **Trickplay Images** - Preview thumbnail sheets for video scrubbing
2. **Subtitles** - External subtitle files (for non-transcoded content)
3. **Cover Images** - Primary item images and series images
4. **Segments** - Intro and credit skip timestamps

### File Management
- Automatic cleanup of all associated files (video, subtitles, trickplay)
- Size calculation including all assets
- Batch delete operations

## Implementation Details

### Pure Functions
All core logic is implemented as pure functions that:
- Take explicit parameters
- Return explicit values
- Have no side effects
- Are easily testable

### Imperative Design
The module uses imperative function calls rather than reactive patterns:
- Direct function invocation
- Explicit error handling
- Clear control flow
- Minimal side effects

### Storage
- **MMKV** - Used for persistent database storage
- **expo-file-system** - Used for file operations
- **Native module** - Used for background downloads

## Usage

```typescript
import { useDownload } from '@/providers/DownloadProvider';

function MyComponent() {
  const {
    startBackgroundDownload,
    cancelDownload,
    deleteFile,
    getDownloadedItems,
    processes,
  } = useDownload();

  // Start a download
  await startBackgroundDownload(url, item, mediaSource, bitrate);

  // Cancel a download
  await cancelDownload(itemId);

  // Delete a download
  await deleteFile(itemId);

  // Get all downloads
  const items = getDownloadedItems();
}
```

## Event Flow

1. **Start Download**
   - Pre-download cover images
   - Start video download via native module
   - Track progress via event listeners

2. **Download Progress**
   - Native module emits progress events
   - React state updated with progress percentage
   - UI reflects current download state

3. **Download Complete**
   - Video file saved to disk
   - Additional assets downloaded in parallel:
     - Trickplay images
     - Subtitles (if applicable)
     - Segments data
   - Item saved to database
   - Notification sent
   - Process removed from queue

4. **Delete**
   - Item removed from database
   - All associated files deleted:
     - Video file
     - Subtitle files
     - Trickplay directory

## File Structure

```
providers/Downloads/
├── additionalDownloads.ts    # Trickplay, subtitles, cover images
├── database.ts                # MMKV operations
├── fileOperations.ts          # File system operations
├── notifications.ts           # Notification helpers
├── types.ts                   # TypeScript types
├── utils.ts                   # Utility functions
├── index.ts                   # Module exports
├── hooks/
│   ├── useDownloadEventHandlers.ts
│   └── useDownloadOperations.ts
└── README.md                  # This file
```

## Future Enhancements

- Background download scheduling
- Network condition awareness
- Download priority management
- Automatic cleanup of old downloads
- Series season download management
