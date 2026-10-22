import Foundation

/// Where a destination stored before an app update is now.
///
/// iOS keeps the app's data in a container whose path holds a UUID, and an update can move the
/// app to a new one. A destination is stored whole when a download is queued, in the App Group,
/// which does not move, so a download still queued or running across an update names the old
/// container: moving the finished file there fails, and the download is lost (#2252).
enum AppContainerPath {
  /// `path` in the current container when it lies at the same place in a sibling one (the
  /// same directory of containers, any UUID), and unchanged otherwise. `documents` is the
  /// current Documents directory, which sits at the top of the container.
  static func current(_ path: String, documents: URL) -> String {
    let container = withoutPrivate(documents.standardizedFileURL.deletingLastPathComponent().path)
    let stored = withoutPrivate(path)
    if stored.hasPrefix(container + "/") { return path }

    let containerComponents = container.split(separator: "/", omittingEmptySubsequences: false)
    // The root, a directory of containers and a container: a shorter path has no sibling
    // container to have moved from.
    guard containerComponents.count >= minimumContainerComponents else { return path }
    let containers = containerComponents.dropLast().joined(separator: "/")
    guard stored.hasPrefix(containers + "/") else { return path }

    // What follows the directory of containers is the old container's UUID, then the place in it.
    let inContainers = stored.dropFirst(containers.count + 1)
    guard let slash = inContainers.firstIndex(of: "/") else { return path }
    let place = inContainers[inContainers.index(after: slash)...]
    guard slash != inContainers.startIndex, !place.isEmpty else { return path }
    // A place with ".." in it could lead out of the container: only a destination that stays in
    // it moves.
    let moved = URL(fileURLWithPath: container + "/" + place).standardizedFileURL.path
    guard moved.hasPrefix(container + "/") else { return path }
    return moved
  }

  private static let minimumContainerComponents = 3

  /// "/private/var" is the same directory as "/var" on iOS, and a path can name either.
  private static func withoutPrivate(_ path: String) -> String {
    path.hasPrefix("/private/") ? String(path.dropFirst("/private".count)) : path
  }
}
