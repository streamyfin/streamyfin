// compiler(>=6.2) ≈ Xcode 26 / iOS 26 SDK. On older toolchains this whole file compiles away and
// the module degrades to the pre-26 behavior (suspension + timer-projection Live Activity).
// NOT swift(>=…): that checks the language *mode*, and CocoaPods targets build in Swift 5 mode —
// it silently compiled this feature out even under Xcode 26.
#if os(iOS) && compiler(>=6.2)
  import BackgroundTasks
  import Foundation

  /// Keeps the app process executing while user-started downloads run.
  ///
  /// iOS 26's continued processing tasks are the sanctioned way to keep running after the user
  /// backgrounds the app, for work they explicitly started. While one is live the process is NOT
  /// suspended — the URLSession delegate keeps delivering `didWriteData` and the Live Activity
  /// shows *measured* percent all the way through. The widget's timer projection then only covers
  /// what this cannot: pre-iOS 26 devices, a submit refusal, or the system expiring the task,
  /// after which the process suspends and the pre-26 behavior takes over seamlessly.
  ///
  /// One task spans the whole queue session: submitted when a download is started from the
  /// foreground (submission requires it), completed when both the active transfer and the queue
  /// drain, so chained episodes stay covered without re-submitting from the background.
  @available(iOS 26.0, *)
  final class DownloadContinuedProcessingKeeper {
    static let shared = DownloadContinuedProcessingKeeper()

    /// Must be declared in BGTaskSchedulerPermittedIdentifiers (see withDownloadLiveActivity.ts).
    private static let taskIdentifier = "com.fredrikburmester.streamyfin.downloads"

    private let queue = DispatchQueue(
      label: "com.fredrikburmester.streamyfin.downloadkeeper"
    )
    private var task: BGContinuedProcessingTask?
    private var isRegistered = false
    /// Submitted but the launch handler has not run yet — guards double submission.
    private var isPending = false

    /// The keeper's system UI replaces the module's own Live Activity on iOS 26+, so when the
    /// keeper cannot run (submission refused, task expired) the module needs to know and put its
    /// regular activity up instead. Set once by the module at creation.
    var onUnavailable: (() -> Void)?

    /// Submits the keeper task if none is live. Safe to call on every download start; queue
    /// advances reuse the already-running task. Submission is refused by the system outside the
    /// foreground — that is fine, the caller's flow works without it.
    func ensureRunning(title: String, subtitle: String) {
      queue.async {
        guard self.task == nil, !self.isPending else { return }
        self.registerIfNeededLocked()

        let request = BGContinuedProcessingTaskRequest(
          identifier: Self.taskIdentifier,
          title: title,
          subtitle: subtitle
        )
        do {
          try BGTaskScheduler.shared.submit(request)
          self.isPending = true
          backgroundDownloaderLog.notice("Continued processing task submitted")
        } catch {
          backgroundDownloaderLog.error(
            "Continued processing submit failed: \(error.localizedDescription, privacy: .public)"
          )
          self.onUnavailable?()
        }
      }
    }

    /// Feeds real transfer progress into the system task UI. Progress must keep advancing or the
    /// system may end the task.
    func updateProgress(completedBytes: Int64, totalBytes: Int64) {
      queue.async {
        guard let task = self.task, totalBytes > 0 else { return }
        task.progress.totalUnitCount = totalBytes
        task.progress.completedUnitCount = min(completedBytes, totalBytes)
      }
    }

    /// Ends the task once the whole queue session is done (or cancelled).
    func finish() {
      queue.async {
        self.isPending = false
        guard let task = self.task else { return }
        task.progress.completedUnitCount = task.progress.totalUnitCount
        task.setTaskCompleted(success: true)
        self.task = nil
        backgroundDownloaderLog.notice("Continued processing task completed")
      }
    }

    private func registerIfNeededLocked() {
      guard !isRegistered else { return }
      isRegistered = true

      BGTaskScheduler.shared.register(
        forTaskWithIdentifier: Self.taskIdentifier,
        using: queue
      ) { task in
        guard let continued = task as? BGContinuedProcessingTask else {
          task.setTaskCompleted(success: false)
          return
        }

        // Event-driven, not a work loop: the task is held open while the download queue drains.
        // Progress arrives from the URLSession delegate via updateProgress; completion via
        // finish(). The launch handler runs on `queue`, so state access here is confined.
        continued.progress.totalUnitCount = 100
        continued.progress.completedUnitCount = 0

        // Instrumentation for the stop-button experiment: a user tap on the system UI's stop
        // control may surface as Progress cancellation, as task expiration, or both — the
        // distinction decides whether stop can safely cancel the download itself (a system
        // expiration must NOT).
        continued.progress.cancellationHandler = { [weak self] in
          guard let self else { return }
          self.queue.async {
            backgroundDownloaderLog.notice("Continued processing progress CANCELLED (user tapped stop?)")
          }
        }
        continued.expirationHandler = { [weak self] in
          guard let self else { return }
          self.queue.async {
            let userCancelled = self.task?.progress.isCancelled ?? false
            backgroundDownloaderLog.notice(
              "Continued processing task expired (progress.isCancelled: \(userCancelled))"
            )
            self.task?.setTaskCompleted(success: false)
            self.task = nil
            self.onUnavailable?()
          }
        }

        self.task = continued
        self.isPending = false
        backgroundDownloaderLog.notice(
          "Continued processing task running; downloads keep reporting while backgrounded"
        )
      }
    }
  }
#endif
