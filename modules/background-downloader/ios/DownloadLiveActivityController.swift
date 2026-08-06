#if os(iOS)
  import ActivityKit
  import Foundation

  /// Owns the download Live Activity end to end.
  ///
  /// Deliberately driven from the `URLSession` delegate rather than from JS. iOS wakes the app in the
  /// background to deliver `didWriteData` batches and always relaunches it for
  /// `handleEventsForBackgroundURLSession` on completion, but the React Native runtime is usually
  /// gone by then — so the terminal "Downloaded" flip is only reliable from native.
  ///
  /// It cannot beat suspension: while iOS has the process suspended no code runs at all and the
  /// transfer continues out-of-process in `nsurlsessiond`. That is why every update carries a
  /// `staleDate`, so the system visibly de-emphasizes numbers that have gone old.
  @available(iOS 16.2, *)
  final class DownloadLiveActivityController {
    static let shared = DownloadLiveActivityController()

    /// ActivityKit budgets updates; the URLSession delegate fires far more often than this.
    private static let minUpdateInterval: TimeInterval = 1.0
    /// Sample window for the speed average. `didWriteData` fires many times a second and the
    /// per-callback byte deltas are far too jittery to divide by — averaging over a full second
    /// keeps the displayed rate readable.
    private static let minSpeedSampleInterval: TimeInterval = 1.0
    /// Low alpha: heavily favour history over the newest sample. Download throughput is spiky, and
    /// a responsive average just renders as a number that will not sit still.
    private static let speedSmoothingAlpha = 0.15
    /// How long a pushed update stays "current". Long enough that ordinary background wake-up gaps
    /// do not constantly dim the activity, short enough that a dead transfer stops looking live.
    private static let staleInterval: TimeInterval = 5 * 60

    private struct Tracker {
      var activityId: String
      var attributes: DownloadActivityAttributes
      var lastPushedAt: Date
      var lastSampleAt: Date
      var lastBytes: Int64
      var emaSpeed: Double
    }

    private let queue = DispatchQueue(
      label: "com.fredrikburmester.streamyfin.downloadliveactivity"
    )
    private var trackers: [Int: Tracker] = [:]
    private var isEnabled = true

    private var activitiesAvailable: Bool {
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // MARK: - Configuration

    func setEnabled(_ enabled: Bool) {
      queue.async {
        guard self.isEnabled != enabled else { return }
        self.isEnabled = enabled
        if !enabled {
          self.endAllLocked(state: .completed, dismissImmediately: true)
        }
      }
    }

    // MARK: - Lifecycle

    func start(taskId: Int, metadata: DownloadActivityMetadata, queuedCount: Int) {
      queue.async {
        guard self.isEnabled, self.activitiesAvailable else { return }
        guard self.trackers[taskId] == nil else { return }

        // Only one download runs at a time, so anything still live belongs to a previous task.
        self.endAllLocked(state: .completed, dismissImmediately: true)

        let attributes = DownloadActivityAttributes(
          itemId: metadata.itemId,
          title: metadata.title,
          subtitle: metadata.subtitle,
          posterFileName: metadata.posterFileName,
          estimatedTotalBytes: metadata.estimatedTotalBytes,
          labels: metadata.labels
        )
        let now = Date()
        let state = DownloadActivityAttributes.ContentState(
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          speedBytesPerSec: 0,
          queuedCount: queuedCount,
          state: .downloading
        )

        do {
          let activity = try Activity.request(
            attributes: attributes,
            content: ActivityContent(
              state: state,
              staleDate: now.addingTimeInterval(Self.staleInterval)
            ),
            pushType: nil
          )
          self.trackers[taskId] = Tracker(
            activityId: activity.id,
            attributes: attributes,
            lastPushedAt: now,
            lastSampleAt: now,
            lastBytes: 0,
            emaSpeed: 0
          )
        } catch {
          print("[LiveActivity] Failed to start: \(error.localizedDescription)")
        }
      }
    }

    func update(taskId: Int, bytesWritten: Int64, totalBytes: Int64, queuedCount: Int) {
      queue.async {
        guard self.isEnabled, var tracker = self.trackers[taskId] else { return }

        let now = Date()
        let sampleInterval = now.timeIntervalSince(tracker.lastSampleAt)

        // Speed is computed here rather than reusing the JS calculator in
        // providers/Downloads/hooks/useDownloadSpeedCalculator.ts, because that one only runs while
        // the JS runtime is alive — exactly when we do not need it.
        if sampleInterval >= Self.minSpeedSampleInterval, bytesWritten >= tracker.lastBytes {
          let instantaneous = Double(bytesWritten - tracker.lastBytes) / sampleInterval
          tracker.emaSpeed =
            tracker.emaSpeed == 0
            ? instantaneous
            : Self.speedSmoothingAlpha * instantaneous
              + (1 - Self.speedSmoothingAlpha) * tracker.emaSpeed
          tracker.lastBytes = bytesWritten
          tracker.lastSampleAt = now
        }

        let effectiveTotal =
          totalBytes > 0 ? totalBytes : tracker.attributes.estimatedTotalBytes
        let progress =
          effectiveTotal > 0
          ? min(max(Double(bytesWritten) / Double(effectiveTotal), 0), 1)
          : 0

        self.trackers[taskId] = tracker

        guard now.timeIntervalSince(tracker.lastPushedAt) >= Self.minUpdateInterval else { return }
        tracker.lastPushedAt = now
        self.trackers[taskId] = tracker

        let state = DownloadActivityAttributes.ContentState(
          progress: progress,
          bytesDownloaded: bytesWritten,
          totalBytes: effectiveTotal,
          speedBytesPerSec: tracker.emaSpeed,
          queuedCount: queuedCount,
          state: .downloading
        )

        // The bar cannot advance while we are suspended, so this is what stops a transfer that died
        // mid-flight from sitting there looking like a confident, current 62%.
        self.push(
          activityId: tracker.activityId,
          state: state,
          staleDate: now.addingTimeInterval(Self.staleInterval)
        )
      }
    }

    func finish(taskId: Int, state finalState: DownloadActivityState, queuedCount: Int) {
      queue.async {
        guard let tracker = self.trackers.removeValue(forKey: taskId) else { return }

        let content = DownloadActivityAttributes.ContentState(
          progress: finalState == .completed ? 1 : 0,
          bytesDownloaded: tracker.lastBytes,
          totalBytes: tracker.attributes.estimatedTotalBytes,
          speedBytesPerSec: 0,
          queuedCount: queuedCount,
          state: finalState
        )
        // Leave the result on the Lock Screen briefly; the next queued download replaces it anyway.
        self.end(
          activityId: tracker.activityId,
          state: content,
          dismissalPolicy: .after(Date().addingTimeInterval(finalState == .failed ? 30 : 15))
        )
      }
    }

    func cancel(taskId: Int) {
      queue.async {
        guard let tracker = self.trackers.removeValue(forKey: taskId) else { return }
        self.end(activityId: tracker.activityId, state: nil, dismissalPolicy: .immediate)
      }
    }

    func cancelAll() {
      queue.async {
        self.endAllLocked(state: .completed, dismissImmediately: true)
      }
    }

    /// Ends any activity with no live task behind it. Covers the app being killed mid-download and
    /// relaunched later, which would otherwise leave an activity stuck on the Lock Screen forever.
    func reconcile(activeTaskIds: Set<Int>) {
      queue.async {
        for (taskId, tracker) in self.trackers where !activeTaskIds.contains(taskId) {
          self.trackers.removeValue(forKey: taskId)
          self.end(activityId: tracker.activityId, state: nil, dismissalPolicy: .immediate)
        }

        let known = Set(self.trackers.values.map(\.activityId))
        for activity in Activity<DownloadActivityAttributes>.activities
        where !known.contains(activity.id) {
          Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
      }
    }

    // MARK: - ActivityKit plumbing

    private func endAllLocked(state: DownloadActivityState, dismissImmediately: Bool) {
      let current = trackers
      trackers.removeAll()
      for (_, tracker) in current {
        end(
          activityId: tracker.activityId,
          state: nil,
          dismissalPolicy: dismissImmediately ? .immediate : .default
        )
      }
    }

    private func push(
      activityId: String,
      state: DownloadActivityAttributes.ContentState,
      staleDate: Date
    ) {
      guard
        let activity = Activity<DownloadActivityAttributes>.activities.first(where: {
          $0.id == activityId
        })
      else { return }

      Task {
        await activity.update(ActivityContent(state: state, staleDate: staleDate))
      }
    }

    private func end(
      activityId: String,
      state: DownloadActivityAttributes.ContentState?,
      dismissalPolicy: ActivityUIDismissalPolicy
    ) {
      guard
        let activity = Activity<DownloadActivityAttributes>.activities.first(where: {
          $0.id == activityId
        })
      else { return }

      let content = state.map { ActivityContent(state: $0, staleDate: nil) }
      Task {
        await activity.end(content, dismissalPolicy: dismissalPolicy)
      }
    }
  }
#endif
