# Getting Started with KSPlayer

KSPlayer is a powerful media playback framework for iOS, tvOS, macOS, xrOS, and visionOS. It supports both AVPlayer and FFmpeg-based playback with AppKit/UIKit/SwiftUI support.

## Requirements

- iOS 13+
- macOS 10.15+
- tvOS 13+
- xrOS 1+

## Troubleshooting

### Missing Metal Toolchain (CocoaPods builds)

If your build fails compiling `Shaders.metal` with:

`cannot execute tool 'metal' due to missing Metal Toolchain`

Install the component:

```bash
xcodebuild -downloadComponent MetalToolchain
```

Then verify:

```bash
xcrun --find metal
xcrun metal -v
```

## Installation

### Swift Package Manager

Add KSPlayer to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/kingslay/KSPlayer.git", .branch("main"))
]
```

Or in Xcode: File → Add Packages → Enter the repository URL.

### CocoaPods

Add to your `Podfile`:

```ruby
target 'YourApp' do
    use_frameworks!
    pod 'KSPlayer', :git => 'https://github.com/kingslay/KSPlayer.git', :branch => 'main'
    pod 'DisplayCriteria', :git => 'https://github.com/kingslay/KSPlayer.git', :branch => 'main'
    pod 'FFmpegKit', :git => 'https://github.com/kingslay/FFmpegKit.git', :branch => 'main'
    pod 'Libass', :git => 'https://github.com/kingslay/FFmpegKit.git', :branch => 'main'
end
```

Then run:

```bash
pod install
```

## Initial Setup

### Configure Player Type

KSPlayer supports two player backends:
- `KSAVPlayer` - Uses AVPlayer (default first player)
- `KSMEPlayer` - Uses FFmpeg for decoding

Configure the player type before creating any player views:

```swift
import KSPlayer

// Use KSMEPlayer as the secondary/fallback player
KSOptions.secondPlayerType = KSMEPlayer.self

// Or set KSMEPlayer as the primary player
KSOptions.firstPlayerType = KSMEPlayer.self
```

### Player Type Selection Strategy

The player uses `firstPlayerType` initially. If playback fails, it automatically switches to `secondPlayerType`.

```swift
// Default configuration
KSOptions.firstPlayerType = KSAVPlayer.self   // Uses AVPlayer first
KSOptions.secondPlayerType = KSMEPlayer.self  // Falls back to FFmpeg
```

## Quick Start

### UIKit

```swift
import KSPlayer

class VideoViewController: UIViewController {
    private var playerView: IOSVideoPlayerView!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        KSOptions.secondPlayerType = KSMEPlayer.self
        
        playerView = IOSVideoPlayerView()
        view.addSubview(playerView)
        
        playerView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            playerView.topAnchor.constraint(equalTo: view.topAnchor),
            playerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            playerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            playerView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        
        let url = URL(string: "https://example.com/video.mp4")!
        playerView.set(url: url, options: KSOptions())
    }
}
```

### SwiftUI (iOS 16+)

```swift
import KSPlayer
import SwiftUI

struct VideoPlayerScreen: View {
    let url: URL
    
    var body: some View {
        KSVideoPlayerView(url: url, options: KSOptions())
    }
}
```

## Key Imports

```swift
import KSPlayer
import AVFoundation  // For AVMediaType, etc.
```

## Next Steps

- [UIKit Usage](UIKitUsage.md) - Detailed UIKit integration
- [SwiftUI Usage](SwiftUIUsage.md) - SwiftUI views and modifiers
- [KSOptions](KSOptions.md) - Configuration options
- [Types and Protocols](TypesAndProtocols.md) - Core types reference

