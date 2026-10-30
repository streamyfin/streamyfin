`new-swift-file-needs-pod-install` | a Swift file added to a local module joins its Pods target only after `pod install`; until then xcodebuild fails on the types it declares

A local Expo module's iOS sources reach the app through its podspec
(`s.source_files`), and CocoaPods writes the file list into the generated Pods
project when the pods are installed. A Swift file added to `modules/<name>/ios`
after that is on disk but in no target, so the next xcodebuild fails with
"cannot find type ... in scope" on whatever the new file declares, which reads
like a code error.

Run `pod install` in `ios/` (or `bun run prebuild`, which runs it) after adding a
Swift file to a module, then build again. Seen on 2026-10-28 when
`PlayerEngineProtocols.swift` was added to `mpv-player` (`HDRMode` not found).
