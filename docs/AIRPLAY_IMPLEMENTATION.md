# AirPlay Implementation Guide

## Overview

This document outlines the implementation approach for AirPlay support in the unified casting system. AirPlay detection and control requires native iOS development as the current React Native library (`@douglowder/expo-av-route-picker-view`) only provides a UI picker, not state detection.

## Current State

### What's Working
- ✅ Unified casting architecture supports both Chromecast and AirPlay
- ✅ `useCasting` hook has AirPlay protocol type
- ✅ UI components are protocol-agnostic
- ✅ AirPlay UI picker available via `ExpoAvRoutePickerView`

### What's Missing
- ❌ AirPlay connection state detection
- ❌ AirPlay playback control (play/pause/seek)
- ❌ AirPlay progress monitoring
- ❌ AirPlay volume control

## Implementation Approaches

### Option 1: Native Module for AVAudioSession (Recommended)

**Pros:**
- Most reliable for detection
- Works for both audio and video
- Provides route change notifications

**Cons:**
- Requires Objective-C/Swift development
- Additional native code to maintain

**Implementation:**

1. Create native module: `modules/expo-airplay-detector`

```objective-c
// ios/ExpoAirPlayDetector.h
#import <ExpoModulesCore/ExpoModulesCore.h>

@interface ExpoAirPlayDetector : EXExportedModule <EXEventEmitter>
@end

// ios/ExpoAirPlayDetector.m
#import "ExpoAirPlayDetector.h"
#import <AVFoundation/AVFoundation.h>

@implementation ExpoAirPlayDetector

EX_EXPORT_MODULE(ExpoAirPlayDetector)

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onRouteChange"];
}

- (void)startObserving {
  [[NSNotificationCenter defaultCenter]
    addObserver:self
    selector:@selector(handleRouteChange:)
    name:AVAudioSessionRouteChangeNotification
    object:nil];
}

- (void)stopObserving {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)handleRouteChange:(NSNotification *)notification {
  AVAudioSessionRouteDescription *currentRoute = 
    [[AVAudioSession sharedInstance] currentRoute];
  
  BOOL isAirPlayActive = NO;
  NSString *deviceName = @"";
  
  for (AVAudioSessionPortDescription *output in currentRoute.outputs) {
    if ([output.portType isEqualToString:AVAudioSessionPortAirPlay]) {
      isAirPlayActive = YES;
      deviceName = output.portName;
      break;
    }
  }
  
  [self sendEventWithName:@"onRouteChange" body:@{
    @"isAirPlayActive": @(isAirPlayActive),
    @"deviceName": deviceName
  }];
}

EX_EXPORT_METHOD_AS(isAirPlayActive,
                    isAirPlayActive:(EXPromiseResolveBlock)resolve
                    reject:(EXPromiseRejectBlock)reject) {
  AVAudioSessionRouteDescription *currentRoute = 
    [[AVAudioSession sharedInstance] currentRoute];
  
  for (AVAudioSessionPortDescription *output in currentRoute.outputs) {
    if ([output.portType isEqualToString:AVAudioSessionPortAirPlay]) {
      resolve(@YES);
      return;
    }
  }
  resolve(@NO);
}

@end
```

2. Create TypeScript wrapper:

```typescript
// modules/expo-airplay-detector/index.ts
import { EventEmitter, NativeModulesProxy } from 'expo-modules-core';

const emitter = new EventEmitter(NativeModulesProxy.ExpoAirPlayDetector);

export function isAirPlayActive(): Promise<boolean> {
  return NativeModulesProxy.ExpoAirPlayDetector.isAirPlayActive();
}

export function addRouteChangeListener(
  listener: (event: { isAirPlayActive: boolean; deviceName: string }) => void
) {
  return emitter.addListener('onRouteChange', listener);
}
```

3. Integrate into `useCasting`:

```typescript
import { addRouteChangeListener, isAirPlayActive } from '@/modules/expo-airplay-detector';

// In useCasting hook
const [airplayConnected, setAirplayConnected] = useState(false);

useEffect(() => {
  if (Platform.OS !== 'ios') return;
  
  // Initial check
  isAirPlayActive().then(setAirplayConnected);
  
  // Listen for changes
  const subscription = addRouteChangeListener((event) => {
    setAirplayConnected(event.isAirPlayActive);
    if (event.isAirPlayActive) {
      setState(prev => ({
        ...prev,
        currentDevice: {
          id: 'airplay',
          name: event.deviceName,
          protocol: 'airplay',
        },
      }));
    }
  });
  
  return () => subscription.remove();
}, []);
```

### Option 2: AVPlayer Integration

**Pros:**
- Already using AVPlayer for video playback
- Access to `isExternalPlaybackActive` property
- Can control playback via existing player

**Cons:**
- Requires modifying video player implementation
- Only works for video, not audio
- Tightly coupled to player lifecycle

**Implementation:**

1. Expose AVPlayer state in video player component
2. Pass state up to casting system via context or props
3. Monitor `AVPlayer.isExternalPlaybackActive`

```typescript
// In video player component
useEffect(() => {
  const checkAirPlay = () => {
    // Requires native module to access AVPlayer.isExternalPlaybackActive
    // or use react-native-video's onExternalPlaybackChange callback
  };
  
  const interval = setInterval(checkAirPlay, 1000);
  return () => clearInterval(interval);
}, []);
```

### Option 3: MPVolumeView-Based Detection

**Pros:**
- Uses existing iOS APIs
- No additional dependencies

**Cons:**
- Unreliable (volume view can be hidden)
- Poor UX (requires accessing MPVolumeView)
- Deprecated approach

**Not Recommended**

## Recommended Implementation Steps

1. **Phase 1: Native Module** (1-2 days)
   - Create `expo-airplay-detector` module
   - Implement route change detection
   - Add TypeScript bindings
   - Test on physical iOS device

2. **Phase 2: Integration** (1 day)
   - Wire detector into `useCasting` hook
   - Update state management
   - Test protocol switching

3. **Phase 3: Controls** (2-3 days)
   - For video: Use AVPlayer controls via existing player
   - For audio: Implement AVAudioSession controls
   - Add seek, volume, play/pause methods

4. **Phase 4: Progress Sync** (1 day)
   - Monitor playback progress
   - Report to Jellyfin API
   - Update UI state

## Testing Requirements

- Test with physical AirPlay devices (Apple TV, HomePod, AirPlay speakers)
- Test with AirPlay 2 multi-room
- Test handoff between Chromecast and AirPlay
- Test background playback
- Test route changes (headphones → AirPlay → speaker)

## Alternative: Third-Party Libraries

Consider these libraries if native development is not feasible:
- `react-native-track-player` - Has AirPlay support built-in
- `react-native-video` - Provides `onExternalPlaybackChange` callback
- Custom fork of `@douglowder/expo-av-route-picker-view` with state detection

## Timeline Estimate

- **Native Module Approach**: 4-5 days
- **AVPlayer Integration**: 2-3 days
- **Third-Party Library**: 1-2 days (integration + testing)

## Next Steps

1. Choose implementation approach based on team's iOS development capacity
2. Set up development environment with physical AirPlay device
3. Create proof-of-concept for route detection
4. Integrate into existing casting system
5. Comprehensive testing across devices

## Resources

- [AVAudioSession Documentation](https://developer.apple.com/documentation/avfoundation/avaudiosession)
- [AVPlayer External Playback](https://developer.apple.com/documentation/avfoundation/avplayer/1388982-isexternalplaybackactive)
- [Expo Modules API](https://docs.expo.dev/modules/overview/)
- [AirPlay 2 Technical Documentation](https://developer.apple.com/documentation/avfoundation/airplay_2)
