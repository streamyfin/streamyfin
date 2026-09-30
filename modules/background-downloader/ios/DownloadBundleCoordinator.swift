import Foundation
import UIKit

/// All mutable state except the cancellation token is confined to the module's state queue.
/// URLSession owns the transfer; the worker owns only the interruptible local remux.
final class DownloadBundleCoordinator {
  private static let downloadProgressWeight = 0.9
  private let queue: DispatchQueue
  private let store = DownloadBundleStore()
  private let emit: (String, [String: Any]) -> Void
  private let keepAlive: (DownloadActivityMetadata) -> Void
  private let changed: () -> Void
  private let canTransfer: () -> Bool
  private var jobs: [String: DownloadBundleJob] = [:]
  private var headers: [String: [String: String]] = [:]
  private var session: URLSession?
  private var foreground = false
  private var backgroundPermission = false
  private var observers: [NSObjectProtocol] = []
  private var mux: (id: String, token: DownloadBundleCancellation)?
  private let interruptionLock = NSLock()
  private var interruptionToken: DownloadBundleCancellation?
  private var transfers: [Int: URLSessionTask] = [:]
  private var ownedTransferIds = Set<Int>()
  private var reconnecting = true
  private var cancellingAll = false
  private var lastProgress: [String: Double] = [:]
  private var lastBytes: [String: Int64] = [:]
  private var startedJobs = Set<String>()

  init(
    queue: DispatchQueue,
    emit: @escaping (String, [String: Any]) -> Void,
    keepAlive: @escaping (DownloadActivityMetadata) -> Void,
    changed: @escaping () -> Void,
    canTransfer: @escaping () -> Bool
  ) {
    self.queue = queue
    self.emit = emit
    self.keepAlive = keepAlive
    self.changed = changed
    self.canTransfer = canTransfer
    for var job in store.load() {
      if job.stage == "cancelled" || job.stage == "completed" {
        store.cleanInputs(job)
        store.remove(job)
        continue
      }
      if job.stage == "remuxing" { job.stage = "queued" }
      jobs[job.id] = job
      if let taskId = job.transferId { ownedTransferIds.insert(taskId) }
    }
    observers = [
      NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { [weak self] _ in self?.setForeground(true) },
      NotificationCenter.default.addObserver(
        forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
      ) { [weak self] _ in self?.setForeground(false) }
    ]
    DispatchQueue.main.async { [weak self] in
      self?.setForeground(UIApplication.shared.applicationState == .active)
    }
  }

  deinit {
    observers.forEach(NotificationCenter.default.removeObserver)
    mux?.token.cancel()
  }

  var isBusy: Bool { mux != nil || jobs.values.contains { $0.transferId != nil } }
  var hasPendingWork: Bool {
    isBusy || jobs.values.contains { job in
      job.stage != "error" && (!job.requiresHeaders || headers[job.id] != nil ||
        job.plan.urls.indices.allSatisfy { store.completedSize(job, $0) > 0 })
    }
  }
  var hasFailures: Bool { jobs.values.contains { $0.error != nil } }

  func connect(_ session: URLSession) {
    self.session = session
    let restoringTaskIds = Set(jobs.values.compactMap(\.transferId))
    session.getAllTasks { [weak self] tasks in
      guard let self else { return }
      self.queue.async {
        self.transfers.merge(
          Dictionary(uniqueKeysWithValues: tasks.map { ($0.taskIdentifier, $0) }),
          uniquingKeysWith: { current, _ in current }
        )
        for task in tasks where task.taskDescription?.hasPrefix("bundle:") == true {
          self.ownedTransferIds.insert(task.taskIdentifier)
          if !self.jobs.values.contains(where: { $0.transferId == task.taskIdentifier }) {
            task.cancel()
          }
        }
        // Completion delegates can already be enqueued when getAllTasks omits their task. Wait
        // until URLSession's serial delegate queue has delivered those before declaring it lost.
        session.delegateQueue.addOperation {
          self.queue.async {
            for var job in self.jobs.values where job.transferId.map(restoringTaskIds.contains) == true {
              if self.transfers[job.transferId!] == nil {
                job.transferId = nil
                job.transferIndex = nil
                job.stage = "queued"
                self.jobs[job.id] = job
                self.persistOrFail(job)
              }
            }
            self.reconnecting = false
            self.advance()
            self.changed()
          }
        }
      }
    }
  }

  func setBackgroundPermission(_ enabled: Bool) {
    if !enabled {
      interruptionLock.lock()
      interruptionToken?.cancel()
      interruptionLock.unlock()
    }
    queue.async {
      self.backgroundPermission = enabled
      if !enabled { self.mux?.token.cancel() }
      self.advance()
    }
  }

  private func setForeground(_ active: Bool) {
    queue.async {
      self.foreground = active
      if !active && !self.backgroundPermission { self.mux?.token.cancel() }
      if active, self.hasPendingWork {
        self.jobs.values.first(where: { $0.stage != "error" }).map { self.keepJobAlive($0) }
      }
      self.advance()
    }
  }

  func enqueue(
    planJson: String, metadata: DownloadActivityMetadata, requestHeaders: [String: String]?
  ) throws -> Int {
    var plan = try JSONDecoder().decode(DownloadBundlePlan.self, from: Data(planJson.utf8))
    try plan.validate()
    guard !metadata.itemId.isEmpty else { throw DownloadBundleFailure.invalidPlan }
    plan.destinationPath = try store.relativeDestination(plan.destinationPath)
    var job: DownloadBundleJob
    if let existing = jobs.values.first(where: { $0.metadata.itemId == metadata.itemId }) {
      guard existing.plan.destinationPath == plan.destinationPath,
        existing.plan.audioTitles == plan.audioTitles,
        existing.plan.audioLanguages == plan.audioLanguages,
        existing.plan.audioUrls.count == plan.audioUrls.count
      else { throw DownloadBundleFailure.incompatibleRetry }
      job = existing
      job.plan = plan
      job.metadata = metadata
      if job.stage == "error" {
        job.stage = job.publishedSize != nil ? "publishing" : "queued"
      }
      job.error = nil
    } else {
      guard !FileManager.default.fileExists(atPath: store.documents.appendingPathComponent(plan.destinationPath).path),
        !jobs.values.contains(where: { $0.plan.destinationPath == plan.destinationPath })
      else { throw DownloadBundleFailure.destinationExists }
      job = DownloadBundleJob(
        id: UUID().uuidString,
        taskId: min(jobs.values.map(\.taskId).min() ?? -1, -1) - 1,
        plan: plan, metadata: metadata, requiresHeaders: !(requestHeaders?.isEmpty ?? true)
      )
    }
    if let requestHeaders {
      headers[job.id] = requestHeaders
      job.requiresHeaders = !requestHeaders.isEmpty
    } else if needsHeaders(job) {
      throw DownloadBundleFailure.missingHeaders
    }
    try store.save(job)
    jobs[job.id] = job
    keepJobAlive(job)
    advance()
    return job.taskId
  }

  func cancel(itemId: String) {
    guard let job = jobs.values.first(where: { $0.metadata.itemId == itemId }) else { return }
    jobs.removeValue(forKey: job.id)
    headers.removeValue(forKey: job.id)
    lastProgress.removeValue(forKey: job.id)
    lastBytes.removeValue(forKey: job.id)
    startedJobs.remove(job.id)
    if let taskId = job.transferId { transfers.removeValue(forKey: taskId)?.cancel() }
    if let taskId = job.transferId {
      ownedTransferIds.insert(taskId)
      session?.getAllTasks { tasks in
        tasks.first(where: { $0.taskIdentifier == taskId })?.cancel()
      }
    }
    if mux?.id == job.id {
      var cancelled = job
      cancelled.stage = "cancelled"
      try? store.save(cancelled)
      mux?.token.cancel()
      // The worker will remove its output after it closes the file.
    } else {
      store.cleanInputs(job)
      store.remove(job)
    }
    changed()
    advance()
  }

  func cancelAll() {
    cancellingAll = true
    Array(jobs.values).forEach { cancel(itemId: $0.metadata.itemId) }
    cancellingAll = false
  }

  func snapshots() -> [[String: Any]] {
    jobs.values.map { job in
      var result = payload(job)
      let active = job.transferId != nil || mux?.id == job.id
      result["state"] = active ? "running" : "queued"
      result["requiresHeaders"] = needsHeaders(job)
      if !active && needsHeaders(job) {
        result["waitingFor"] = "headers"
      } else if !active && job.stage != "error" &&
        job.plan.urls.indices.allSatisfy({ store.completedSize(job, $0) > 0 }) &&
        !foreground && !backgroundPermission {
        result["waitingFor"] = "foreground"
      }
      result["bytesOnDisk"] = store.workingBytes(job)
      if let error = job.error { result["error"] = error }
      return result
    }
  }

  private func payload(_ job: DownloadBundleJob) -> [String: Any] {
    [
      "taskId": job.taskId,
      "itemId": job.metadata.itemId,
      "url": job.plan.videoUrl,
      "destinationPath": store.destination(job).path,
      "stage": job.stage == "remuxing" || job.stage == "publishing" ||
        job.plan.urls.indices.allSatisfy { store.completedSize(job, $0) > 0 } ? "remuxing" : "downloading",
      "progress": lastProgress[job.id] ?? sourceProgress(job),
      "bytesWritten": lastBytes[job.id] ?? completedBytes(job)
    ]
  }

  private func completedBytes(_ job: DownloadBundleJob) -> Int64 {
    job.plan.urls.indices.reduce(0) { $0 + store.completedSize(job, $1) }
  }

  private func needsHeaders(_ job: DownloadBundleJob) -> Bool {
    job.requiresHeaders && headers[job.id] == nil &&
      job.plan.urls.indices.contains { store.completedSize(job, $0) == 0 }
  }

  private func keepJobAlive(_ job: DownloadBundleJob) {
    var metadata = job.metadata
    if job.plan.urls.indices.allSatisfy({ store.completedSize(job, $0) > 0 }) {
      metadata.labels["downloading"] = metadata.labels["remuxing"] ?? "Preparing download"
    }
    keepAlive(metadata)
  }

  private func sourceProgress(_ job: DownloadBundleJob) -> Double {
    let complete = job.plan.urls.indices.filter { store.completedSize(job, $0) > 0 }.count
    return Self.downloadProgressWeight * Double(complete) / Double(job.plan.urls.count)
  }

  private func progress(_ job: DownloadBundleJob, fraction: Double, bytes: Int64) {
    let value = min(max(fraction, lastProgress[job.id] ?? 0), 1)
    lastProgress[job.id] = value
    lastBytes[job.id] = bytes
    var event = payload(job)
    event["progress"] = value
    event["bytesWritten"] = bytes
    event["totalBytes"] = job.metadata.estimatedTotalBytes > 0
      ? max(job.metadata.estimatedTotalBytes, bytes) : 0
    emit("onDownloadProgress", event)
  }

  @discardableResult
  func handleProgress(taskId: Int, bytes: Int64, total: Int64) -> Bool {
    guard let job = jobs.values.first(where: { $0.transferId == taskId }) else {
      return ownedTransferIds.contains(taskId)
    }
    let component = total > 0 ? min(Double(bytes) / Double(total), 1) : 0
    progress(job, fraction: sourceProgress(job) + Self.downloadProgressWeight * component / Double(job.plan.urls.count),
      bytes: completedBytes(job) + bytes)
    return true
  }

  @discardableResult
  func handleComplete(taskId: Int, location: URL, taskDescription: String?) -> Bool {
    let descriptor = taskDescription?.split(separator: ":").map(String.init) ?? []
    let describedJob = descriptor.count == 3 && descriptor[0] == "bundle" ? jobs[descriptor[1]] : nil
    guard var job = jobs.values.first(where: { $0.transferId == taskId }) ?? describedJob,
      let index = job.transferId == taskId ? job.transferIndex : Int(descriptor.last ?? ""),
      job.plan.urls.indices.contains(index)
    else { return ownedTransferIds.contains(taskId) || descriptor.first == "bundle" }
    reconnecting = false
    transfers.removeValue(forKey: taskId)
    do {
      // A background completion can arrive after getAllTasks omitted it on reconnect. Its
      // self-describing task still identifies the source, even if a retry has already started.
      if store.completedSize(job, index) == 0 {
        try store.acceptSource(location, job: job, index: index)
      }
      if job.transferIndex == index {
        if let current = job.transferId, current != taskId {
          transfers.removeValue(forKey: current)?.cancel()
        }
        job.transferId = nil
        job.transferIndex = nil
      }
      if job.transferId == nil { job.stage = "queued" }
      try store.save(job)
      jobs[job.id] = job
      progress(job, fraction: sourceProgress(job), bytes: completedBytes(job))
      advance()
      changed()
    } catch {
      fail(job, error)
    }
    return true
  }

  @discardableResult
  func handleError(taskId: Int, error: Error) -> Bool {
    guard let job = jobs.values.first(where: { $0.transferId == taskId }) else {
      return ownedTransferIds.contains(taskId)
    }
    reconnecting = false
    transfers.removeValue(forKey: taskId)
    fail(job, error)
    return true
  }

  private func persistOrFail(_ job: DownloadBundleJob) {
    do { try store.save(job) } catch { fail(job, error) }
  }

  private func fail(_ original: DownloadBundleJob, _ error: Error) {
    var job = jobs[original.id] ?? original
    job.transferId = nil
    job.transferIndex = nil
    job.stage = "error"
    job.error = error.localizedDescription
    jobs[job.id] = job
    try? store.save(job)
    var event = payload(job)
    event["error"] = error.localizedDescription
    emit("onDownloadError", event)
    changed()
    advance()
  }

  func advance() {
    guard !cancellingAll, !reconnecting, !isBusy, canTransfer(), let session else { return }
    for var job in jobs.values.sorted(by: { $0.taskId > $1.taskId }) {
      if job.stage == "error" { continue }
      if job.stage == "publishing" {
        do { try publish(job) } catch { fail(job, error) }
        return
      }
      if let index = job.plan.urls.indices.first(where: { store.completedSize(job, $0) == 0 }) {
        guard !job.requiresHeaders || headers[job.id] != nil else {
          if job.error == nil {
            job.error = DownloadBundleFailure.missingHeaders.localizedDescription
            jobs[job.id] = job
            persistOrFail(job)
            var event = payload(job)
            event["error"] = job.error
            emit("onDownloadError", event)
          }
          continue
        }
        do {
          var request = URLRequest(url: URL(string: job.plan.urls[index])!)
          request.timeoutInterval = 300
          headers[job.id]?.forEach { request.setValue($1, forHTTPHeaderField: $0) }
          let task = session.downloadTask(with: request)
          task.taskDescription = "bundle:\(job.id):\(index)"
          job.transferId = task.taskIdentifier
          job.transferIndex = index
          job.stage = "downloading"
          do { try store.save(job) } catch {
            task.cancel()
            throw error
          }
          jobs[job.id] = job
          transfers[task.taskIdentifier] = task
          ownedTransferIds.insert(task.taskIdentifier)
          keepJobAlive(job)
          if startedJobs.insert(job.id).inserted {
            emit("onDownloadStarted", payload(job))
          }
          task.resume()
        } catch { fail(job, error) }
        return
      }
      guard foreground || backgroundPermission else { continue }
      startMux(job)
      return
    }
  }

  private func startMux(_ original: DownloadBundleJob) {
    var job = original
    job.stage = "remuxing"
    do { try store.save(job) } catch { fail(job, error); return }
    jobs[job.id] = job
    let token = DownloadBundleCancellation()
    mux = (job.id, token)
    interruptionLock.lock()
    interruptionToken = token
    interruptionLock.unlock()
    let currentJob = job
    keepJobAlive(job)
    progress(job, fraction: Self.downloadProgressWeight, bytes: completedBytes(job))
    DispatchQueue.global(qos: .utility).async {
      let output = self.store.output(currentJob)
      try? FileManager.default.removeItem(at: output)
      let result: Result<Void, Error> = Result {
        try DownloadRemuxer.remux(
          videoPath: self.store.source(currentJob, 0).path,
          audioPaths: currentJob.plan.audioUrls.indices.map { self.store.source(currentJob, $0 + 1).path },
          audioTitles: currentJob.plan.audioTitles, audioLanguages: currentJob.plan.audioLanguages,
          outputPath: output.path,
          onProgress: { value in
            self.queue.async {
              guard self.jobs[currentJob.id] != nil, !token.isCancelled else { return }
              self.progress(currentJob, fraction: Self.downloadProgressWeight + (1 - Self.downloadProgressWeight) * min(value, 0.999),
                bytes: self.completedBytes(currentJob))
            }
          },
          isCancelled: { token.isCancelled }
        )
      }
      self.queue.async {
        self.mux = nil
        self.interruptionLock.lock()
        self.interruptionToken = nil
        self.interruptionLock.unlock()
        guard self.jobs[currentJob.id] != nil else {
          self.store.cleanInputs(currentJob)
          self.store.remove(currentJob)
          self.advance()
          return
        }
        if token.isCancelled {
          try? FileManager.default.removeItem(at: output)
          var waiting = currentJob
          waiting.stage = "queued"
          self.jobs[waiting.id] = waiting
          self.persistOrFail(waiting)
          self.changed()
          self.advance()
          return
        }
        do {
          try result.get()
          var publishing = currentJob
          publishing.stage = "publishing"
          publishing.publishedSize = self.store.size(output)
          guard publishing.publishedSize! > 0 else { throw DownloadBundleFailure.invalidSource }
          try self.store.save(publishing)
          self.jobs[publishing.id] = publishing
          try self.publish(publishing)
        } catch { self.fail(currentJob, error) }
      }
    }
  }

  private func publish(_ job: DownloadBundleJob) throws {
    let destination = store.destination(job)
    let output = store.output(job)
    guard let size = job.publishedSize, size > 0 else { throw DownloadBundleFailure.invalidSource }
    if FileManager.default.fileExists(atPath: output.path) {
      guard !FileManager.default.fileExists(atPath: destination.path) else {
        throw DownloadBundleFailure.destinationExists
      }
      guard store.size(output) == size else { throw DownloadBundleFailure.invalidSource }
      // Both paths are siblings on the same volume; move is an atomic rename, not a copy.
      try FileManager.default.moveItem(at: output, to: destination)
    }
    guard store.size(destination) == size else { throw DownloadBundleFailure.invalidSource }
    var completed = job
    completed.stage = "completed"
    try store.save(completed)
    var event = payload(job)
    event["filePath"] = destination.path
    event["progress"] = 1.0
    store.cleanInputs(job)
    jobs.removeValue(forKey: job.id)
    headers.removeValue(forKey: job.id)
    lastProgress.removeValue(forKey: job.id)
    lastBytes.removeValue(forKey: job.id)
    startedJobs.remove(job.id)
    emit("onDownloadComplete", event)
    store.remove(job)
    changed()
    advance()
  }
}
