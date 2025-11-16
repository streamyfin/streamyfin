# iOS Native Media Controls Integration

The VLC player now supports iOS native media controls, enabling:
- AirPods/Bluetooth headphone controls (play, pause, skip)
- Control Center playback controls
- Lock screen playback controls
- CarPlay integration
- Automatic pause when other audio starts playing

## How It Works

The integration uses three iOS frameworks:
- **MPRemoteCommandCenter**: Handles remote control commands (play/pause, seek, etc.)
- **MPNowPlayingInfoCenter**: Displays playback metadata (title, artist, artwork, progress)
- **AVAudioSession**: Handles audio interruptions (pauses video when other media plays)

## Usage

### Basic Usage

```typescript
import VlcPlayerView from './modules/VlcPlayerView';

<VlcPlayerView
  source={{ uri: 'https://example.com/video.mp4' }}
  paused={false}
  // Basic media controls work out of the box
/>
```

### With Metadata

To display title, artist, and artwork in Control Center and lock screen:

```typescript
<VlcPlayerView
  source={{ uri: 'https://example.com/video.mp4' }}
  paused={false}
  nowPlayingMetadata={{
    title: 'Episode Name',
    artist: 'Series Name',
    albumTitle: 'Season 1',
    artworkUri: 'https://example.com/poster.jpg'
  }}
/>
```

## Supported Commands

### Automatic Commands
- **Play/Pause**: Single press on AirPods or Control Center
- **Toggle Play/Pause**: Works with any remote that supports it
- **Skip Forward**: +15 seconds (customizable)
- **Skip Backward**: -15 seconds (customizable)
- **Seek**: Scrubbing in Control Center

### Customizing Skip Intervals

To change skip intervals, modify the `setupRemoteCommandCenter` method:

```swift
// In VlcPlayerView.swift
commandCenter.skipForwardCommand.preferredIntervals = [30] // 30 seconds
commandCenter.skipBackwardCommand.preferredIntervals = [30] // 30 seconds
```

## Audio Session Configuration

The player automatically configures the audio session with:
- Category: `.playback`
- Mode: `.moviePlayback`
- Options: Default

This ensures:
- Audio continues when screen locks
- Audio ducks other apps' audio
- Proper behavior with silent mode switch

## Metadata Properties

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Main title (e.g., episode name) |
| `artist` | string | Secondary text (e.g., series name) |
| `albumTitle` | string | Tertiary text (e.g., season) |
| `artworkUri` | string | URL to artwork image |

## Example Integration

### In `direct-player.tsx`

Add the `nowPlayingMetadata` prop to the existing VlcPlayerView:

```typescript
// Get image URL from Jellyfin item
const getImageUrl = (item: BaseItemDto | null) => {
  if (!item || !api) return undefined;
  
  const imageTag = 
    item.ImageTags?.Primary || 
    item.SeriesPrimaryImageTag ||
    item.ParentPrimaryImageTag;
  
  if (!imageTag) return undefined;
  
  const itemId = 
    item.ImageTags?.Primary ? item.Id :
    item.SeriesId || item.ParentPrimaryImageTag;
  
  return `${api.basePath}/Items/${itemId}/Images/Primary?tag=${imageTag}&quality=90&maxWidth=400`;
};

// In JSX:
<VlcPlayerView
  ref={videoRef}
  source={{
    uri: stream?.url || "",
    autoplay: true,
    isNetwork: !offline,
    startPosition,
    externalSubtitles,
    initOptions,
  }}
  style={{ width: "100%", height: "100%" }}
  nowPlayingMetadata={{
    title: item?.Name || "Unknown",
    artist: item?.SeriesName || item?.AlbumArtist || "",
    albumTitle: item?.SeasonName || item?.Album || "",
    artworkUri: getImageUrl(item),
  }}
  onVideoProgress={onProgress}
  progressUpdateInterval={1000}
  onVideoStateChange={onPlaybackStateChanged}
  // ... rest of props
/>
```

### Generic Example

```typescript
import { useEffect, useRef } from 'react';
import VlcPlayerView from './modules/VlcPlayerView';

function VideoPlayer({ item }) {
  const playerRef = useRef(null);

  return (
    <VlcPlayerView
      ref={playerRef}
      source={{
        uri: item.streamUrl,
        autoplay: true,
      }}
      paused={false}
      nowPlayingMetadata={{
        title: item.name,
        artist: item.seriesName,
        albumTitle: `Season ${item.seasonNumber}`,
        artworkUri: item.posterUrl,
      }}
      onVideoStateChange={(event) => {
        console.log('Playback state:', event.nativeEvent.state);
      }}
    />
  );
}
```

## Background Audio

To enable background audio playback:

1. Add `UIBackgroundModes` to `Info.plist`:
```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

2. The audio session is already configured to support background playback.

## Troubleshooting

### Controls not working
- Ensure audio session is properly configured (automatic)
- Check that `UIBackgroundModes` includes `audio` in Info.plist
- Verify the player is actually playing (not paused/stopped)

### Metadata not showing
- Verify `nowPlayingMetadata` prop is passed correctly
- Check that artwork URL is accessible and valid
- Look for console logs about artwork loading failures

### AirPods controls delayed
- This is normal; iOS may batch remote commands
- Commands are queued and executed in order

## Technical Details

### Command Handlers
All commands return `.success` or `.commandFailed` to inform iOS of execution status.

### Progress Updates
Now Playing info updates:
- On play/pause state changes
- Every ~1 second during playback (with progress updates)
- When seeking

### Artwork Loading
- Loaded asynchronously from URL
- Cached in memory for duration of playback
- Cleared when player stops

### Memory Management
- Remote command center targets use `weak self`
- Artwork is UIImage (autoreleased)
- Now Playing info cleared on stop

