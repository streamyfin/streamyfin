import Combine
import ExpoModulesCore
import SwiftUI
import UIKit

/// Plain value the SwiftUI layer renders — decoupled from the transport so
/// the view code has no ExpoModulesCore dependency.
struct HeroItem: Identifiable, Equatable, Decodable {
  let id: String
  let title: String
  let subtitle: String?
  let overview: String
  let label: String?
  let labelIcon: String?
  let backdropUrl: String?
  let logoUrl: String?
  let posterUrl: String?
  let badges: [String]
  let communityRating: Double?
  /// Watch progress in 0...1; renders a progress bar when > 0.
  let progress: Double?

  private enum CodingKeys: String, CodingKey {
    case id, title, subtitle, overview, label, labelIcon
    case backdropUrl, logoUrl, posterUrl, badges, communityRating, progress
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
    subtitle = try container.decodeIfPresent(String.self, forKey: .subtitle)
    overview = try container.decodeIfPresent(String.self, forKey: .overview) ?? ""
    label = try container.decodeIfPresent(String.self, forKey: .label)
    labelIcon = try container.decodeIfPresent(String.self, forKey: .labelIcon)
    backdropUrl = try container.decodeIfPresent(String.self, forKey: .backdropUrl)
    logoUrl = try container.decodeIfPresent(String.self, forKey: .logoUrl)
    posterUrl = try container.decodeIfPresent(String.self, forKey: .posterUrl)
    badges = try container.decodeIfPresent([String].self, forKey: .badges) ?? []
    communityRating = try container.decodeIfPresent(
      Double.self, forKey: .communityRating)
    progress = try container.decodeIfPresent(Double.self, forKey: .progress)
      .map { min(max($0, 0), 1) }
  }
}

/// One row of the filter menu. Labels arrive pre-localized.
struct HeroFilterOption: Identifiable, Equatable, Decodable {
  let key: String
  let label: String
  let enabled: Bool
  /// Red one-way action rather than a checkmark toggle.
  let destructive: Bool?

  var id: String { key }
}

/// A group of filter rows. An absent title renders as a plain divider.
struct HeroFilterSection: Identifiable, Equatable, Decodable {
  let key: String
  let title: String?
  let options: [HeroFilterOption]

  var id: String { key }
}

/// Wire format of the `payload` prop.
private struct HeroPayload: Decodable {
  let items: [HeroItem]
  let imageHeaders: [String: String]?
  let filterSections: [HeroFilterSection]?
  let filterLabel: String?
}

/// Observable state so SwiftUI updates in place instead of rebuilding the
/// hosting controller on every prop change.
final class HeroCarouselState: ObservableObject {
  @Published var items: [HeroItem] = []
  @Published var imageHeaders: [String: String] = [:]
  @Published var filterSections: [HeroFilterSection] = []
  @Published var filterLabel: String = ""
}

class HeroCarouselExpoView: ExpoView {
  private var hostingController: UIHostingController<HeroCarouselRootView>?
  private let state = HeroCarouselState()

  let onItemPress = EventDispatcher()
  let onFilterToggle = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    setupHostingController()
  }

  private func setupHostingController() {
    let root = HeroCarouselRootView(
      state: state,
      onItemPress: { [weak self] itemId in
        self?.onItemPress(["id": itemId])
      },
      onFilterToggle: { [weak self] key in
        self?.onFilterToggle(["key": key])
      }
    )
    let hostingController = UIHostingController(rootView: root)
    hostingController.view.backgroundColor = .clear
    // Card shadows and the scaled neighbor cards draw outside the hosting
    // view's bounds while paging.
    hostingController.view.clipsToBounds = false
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false

    addSubview(hostingController.view)

    NSLayoutConstraint.activate([
      hostingController.view.topAnchor.constraint(equalTo: topAnchor),
      hostingController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    self.hostingController = hostingController
  }

  // MARK: - Props

  func setPayload(_ payload: String) {
    guard let data = payload.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(HeroPayload.self, from: data)
    else {
      return
    }
    if decoded.items != state.items {
      state.items = decoded.items
    }
    let headers = decoded.imageHeaders ?? [:]
    if headers != state.imageHeaders {
      state.imageHeaders = headers
    }
    let sections = decoded.filterSections ?? []
    if sections != state.filterSections {
      state.filterSections = sections
    }
    let label = decoded.filterLabel ?? ""
    if label != state.filterLabel {
      state.filterLabel = label
    }
  }
}
