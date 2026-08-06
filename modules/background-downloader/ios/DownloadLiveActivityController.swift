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
  /// There is at most ONE activity, reused across the whole download queue. iOS only allows
  /// `Activity.request` while the app is foregrounded, and queued downloads start from background
  /// wake-ups — so the activity is created for the first download and then *rebound* to each
  /// subsequent one through `activity.update`, which has no foreground restriction. Ending it and
  /// requesting a fresh one per download would leave every episode after the first without an
  /// activity whenever the app is backgrounded.
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

    /// The one live activity and the download currently bound to it.
    private struct Tracker {
      var activityId: String
      var taskId: Int
      var metadata: DownloadActivityMetadata
      var lastPushedAt: Date
      var lastSampleAt: Date
      var lastBytes: Int64
      var emaSpeed: Double
    }

    private let queue = DispatchQueue(
      label: "com.fredrikburmester.streamyfin.downloadliveactivity"
    )
    private var tracker: Tracker?
    private var isEnabled = true
    /// Pushed in by the module whenever its queue changes, instead of being read out of the
    /// module's collections on every progress callback — that read was an unsynchronized
    /// cross-thread access to state owned by another queue.
    private var queuedCount = 0

    private var activitiesAvailable: Bool {
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // MARK: - Configuration

    func setEnabled(_ enabled: Bool) {
      queue.async {
        guard self.isEnabled != enabled else { return }
        self.isEnabled = enabled
        if !enabled {
          self.endAllLocked(dismissImmediately: true)
        }
      }
    }

    func setQueuedCount(_ count: Int) {
      queue.async {
        self.queuedCount = count
      }
    }

    // MARK: - Lifecycle

    func start(taskId: Int, metadata: DownloadActivityMetadata) {
      queue.async {
        guard self.isEnabled else { return }
        guard self.tracker?.taskId != taskId else { return }

        let now = Date()
        let state = self.contentState(
          for: metadata,
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          speed: 0,
          state: .downloading
        )

        // Rebind a live activity if there is one — ours, or any orphan of our type. This is the
        // only path that works from the background, which is where queued downloads start.
        let candidateId = self.tracker?.activityId
          ?? Activity<DownloadActivityAttributes>.activities.first?.id
        if let activityId = candidateId,
          Activity<DownloadActivityAttributes>.activities.contains(where: { $0.id == activityId })
        {
          self.tracker = Tracker(
            activityId: activityId,
            taskId: taskId,
            metadata: metadata,
            lastPushedAt: now,
            lastSampleAt: now,
            lastBytes: 0,
            emaSpeed: 0
          )
          self.push(
            activityId: activityId,
            state: state,
            staleDate: now.addingTimeInterval(Self.staleInterval)
          )
          return
        }

        guard self.activitiesAvailable else { return }

        do {
          let activity = try Activity.request(
            attributes: DownloadActivityAttributes(labels: metadata.labels),
            content: ActivityContent(
              state: state,
              staleDate: now.addingTimeInterval(Self.staleInterval)
            ),
            pushType: nil
          )
          self.tracker = Tracker(
            activityId: activity.id,
            taskId: taskId,
            metadata: metadata,
            lastPushedAt: now,
            lastSampleAt: now,
            lastBytes: 0,
            emaSpeed: 0
          )
        } catch {
          // Most commonly ActivityKit refusing a request from the background with no existing
          // activity to rebind (e.g. the queue was armed while the Lock Screen showed nothing).
          self.tracker = nil
          print("[LiveActivity] Failed to start: \(error.localizedDescription)")
        }
      }
    }

    func update(taskId: Int, bytesWritten: Int64, totalBytes: Int64) {
      queue.async {
        guard self.isEnabled, var tracker = self.tracker, tracker.taskId == taskId else { return }

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
          totalBytes > 0 ? totalBytes : tracker.metadata.estimatedTotalBytes
        let progress =
          effectiveTotal > 0
          ? min(max(Double(bytesWritten) / Double(effectiveTotal), 0), 1)
          : 0

        self.tracker = tracker

        guard now.timeIntervalSince(tracker.lastPushedAt) >= Self.minUpdateInterval else { return }
        tracker.lastPushedAt = now
        self.tracker = tracker

        let state = self.contentState(
          for: tracker.metadata,
          progress: progress,
          bytesDownloaded: bytesWritten,
          totalBytes: effectiveTotal,
          speed: tracker.emaSpeed,
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

    func finish(taskId: Int, state finalState: DownloadActivityState) {
      queue.async {
        guard let tracker = self.tracker, tracker.taskId == taskId else { return }

        let content = self.contentState(
          for: tracker.metadata,
          progress: finalState == .completed ? 1 : 0,
          bytesDownloaded: tracker.lastBytes,
          totalBytes: tracker.metadata.estimatedTotalBytes,
          speed: 0,
          state: finalState
        )

        if self.queuedCount > 0 {
          // More downloads are queued and the app may be backgrounded, where a replacement
          // activity could not be requested. Keep this one alive showing the result; the next
          // download's start() rebinds it moments later.
          self.push(
            activityId: tracker.activityId,
            state: content,
            staleDate: Date().addingTimeInterval(Self.staleInterval)
          )
        } else {
          self.tracker = nil
          // Leave the result on the Lock Screen briefly before dismissing.
          self.end(
            activityId: tracker.activityId,
            state: content,
            dismissalPolicy: .after(Date().addingTimeInterval(finalState == .failed ? 30 : 15))
          )
        }
      }
    }

    func cancel(taskId: Int) {
      queue.async {
        guard let tracker = self.tracker, tracker.taskId == taskId else { return }
        // With downloads still queued the activity is kept for rebinding, same as finish().
        guard self.queuedCount == 0 else { return }
        self.tracker = nil
        self.end(activityId: tracker.activityId, state: nil, dismissalPolicy: .immediate)
      }
    }

    func cancelAll() {
      queue.async {
        self.endAllLocked(dismissImmediately: true)
      }
    }

    /// Re-adopts an activity that survived a process restart and ends any others.
    ///
    /// `tracker` lives only in memory, so after a cold relaunch a surviving activity is unknown
    /// here — and iOS relaunches the app precisely because a background transfer is still
    /// progressing or just finished. Ending it would destroy the Live Activity for the remainder
    /// of the download and, because new activities cannot be requested from the background, for
    /// every queued download after it. The activity is matched back to its restored task via the
    /// itemId it is currently rendering.
    ///
    /// Matching deliberately ignores whether the task is still present in the `URLSession`: a
    /// task that completed while the app was dead is already absent from `getAllTasks`, yet its
    /// `didFinishDownloadingTo` arrives moments later and must find the tracker to flip the
    /// activity to "Downloaded" (the same race `DownloadTaskStore` documents). An adopted activity
    /// whose task truly died is ended by the delegate's failure/cancellation callbacks.
    func reconcile(persistedTasks: [Int: DownloadActivityMetadata]) {
      queue.async {
        for activity in Activity<DownloadActivityAttributes>.activities {
          if self.tracker == nil,
            self.isEnabled,
            let match = persistedTasks.first(where: {
              $0.value.itemId == activity.content.state.itemId
            })
          {
            self.tracker = Tracker(
              activityId: activity.id,
              taskId: match.key,
              metadata: match.value,
              // Backdated so the first post-relaunch progress tick pushes immediately instead of
              // waiting out the update throttle.
              lastPushedAt: .distantPast,
              lastSampleAt: Date(),
              // Seeded from the activity's last rendered state so the first speed sample measures
              // the delta since relaunch, not the whole download so far.
              lastBytes: activity.content.state.bytesDownloaded,
              emaSpeed: 0
            )
          } else if self.tracker?.activityId != activity.id {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
          }
        }
      }
    }

    // MARK: - ActivityKit plumbing

    private func contentState(
      for metadata: DownloadActivityMetadata,
      progress: Double,
      bytesDownloaded: Int64,
      totalBytes: Int64,
      speed: Double,
      state: DownloadActivityState
    ) -> DownloadActivityAttributes.ContentState {
      DownloadActivityAttributes.ContentState(
        itemId: metadata.itemId,
        title: metadata.title,
        subtitle: metadata.subtitle,
        posterFileName: metadata.posterFileName,
        progress: progress,
        bytesDownloaded: bytesDownloaded,
        totalBytes: totalBytes,
        speedBytesPerSec: speed,
        queuedCount: queuedCount,
        state: state
      )
    }

    private func endAllLocked(dismissImmediately: Bool) {
      tracker = nil
      // Ends every live activity of our type, orphans included.
      for activity in Activity<DownloadActivityAttributes>.activities {
        Task {
          await activity.end(
            nil,
            dismissalPolicy: dismissImmediately ? .immediate : .default
          )
        }
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
