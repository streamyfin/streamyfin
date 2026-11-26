# A Cast Resume Rebuilds the Client

**Date**: 2026-11-03
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/ReceiverChannelHub.kt`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/GoogleCastChannelPort.kt`, `modules/mpv-player/ios/Cast/ReceiverChannelHub.swift`

## Detail

On Android (play-services-cast-framework 22.3.1), a session that starts or resumes gets a new
Cast client and a new `RemoteMediaClient`. The callbacks given to `setMessageReceivedCallbacks`
lived in the table of the client that was replaced, so they are gone: nothing arrives on the
namespace until it is registered again on the session. After a resume in the same process the
`CastSession` object is the same one; after a process restart it is a new object with the same
session id. `setMessageReceivedCallbacks` also returns without doing anything, and without an
exception, on a session whose client is not connected, so registering a suspended session
silently registers nothing.

On iOS (google-cast-sdk 4.8.6), the resume hands back the `GCKCastSession` object that was
suspended (iPhone simulator, 15/11: `didSuspend` and `didResumeSession` on the same object;
an earlier note had read it as a new object under the same id). That object keeps the
`GCKGenericChannel` added to it before the suspension, and `add` refuses a second one for the
namespace: the resumed session then had no live channel, and Repeat, Previous and picking a
track in the queue failed on "not connected". A channel added after the resume connects later
(`castChannelDidConnect`).

Neither the media client nor a channel registration survives a resume. `ReceiverChannelHub`
(both platforms) registers every namespace again on each session it is attached to, a resume
included, and calls a namespace ready only once its channel is live; a session id never stands
for an object. On iOS the hub also takes a port's channels off the session before it lets the
port go (suspension, end, or another port attached), so the resumed object takes a new one.
