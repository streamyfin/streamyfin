import Foundation

// The audio session's queues. A read of the route waits on the audio server just as a change does, so it
// must never hold back the changes playback waits for (waitForPendingChanges, ahead of mpv's loadfile and
// unpause).
@main
enum PlayerAudioSessionTests {
  static var failures: [String] = []
  static var cases = 0

  static func check(_ name: String, _ ok: Bool) {
    cases += 1
    if !ok { failures.append(name) }
  }

  static func main() {
    // A read the audio server holds: the changes playback waits for still go through.
    do {
      let held = DispatchSemaphore(value: 0)
      let reading = DispatchSemaphore(value: 0)
      PlayerAudioSession.shared.read({ () -> Int in
        reading.signal()
        held.wait()
        return 1
      }, completion: { _ in })
      reading.wait()
      let waited = DispatchSemaphore(value: 0)
      DispatchQueue.global().async {
        PlayerAudioSession.shared.waitForPendingChanges()
        waited.signal()
      }
      check("aHeldReadDoesNotHoldBackTheChanges", waited.wait(timeout: .now() + 1) == .success)
      held.signal()
    }

    if failures.isEmpty {
      print("PASS: player audio session (" + String(cases) + " cases)")
    } else {
      failures.forEach { print("FAIL: " + $0) }
      exit(1)
    }
  }
}
