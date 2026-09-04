import Foundation
import Security
import TVServices

private let appGroupInfoPlistKey = "StreamyfinAppGroupIdentifier"
private let keychainAccessGroupInfoPlistKey = "StreamyfinKeychainAccessGroupIdentifier"
private let cacheKey = "TopShelfCache"
private let apiKeyService = "StreamyfinTopShelf"
private let apiKeyAccount = "JellyfinApiKey"

private struct TopShelfCachePayload: Decodable {
  let version: Int?
  let layout: TopShelfLayout?
  let contentPreset: String?
  let sections: [TopShelfCacheSection]
}

private enum TopShelfLayout: String, Decodable {
  case sectioned
  case inset
  case carousel
}

private struct TopShelfCacheSection: Decodable {
  let title: String
  let items: [TopShelfCacheItem]
}

private struct TopShelfCacheItem: Decodable {
  let id: String
  let title: String
  let subtitle: String?
  let contextTitle: String?
  let carouselSummary: String?
  let overview: String?
  let genre: String?
  let durationSeconds: Double?
  let releaseDate: String?
  let badges: [String]?
  let cast: [String]?
  let director: [String]?
  let imageUrl: String?
  let route: String
  let playRoute: String?
}

final class TopShelfProvider: TVTopShelfContentProvider {
  override func loadTopShelfContent(
    completionHandler: @escaping (TVTopShelfContent?) -> Void
  ) {
    guard
      let appGroupIdentifier = Bundle.main.object(
        forInfoDictionaryKey: appGroupInfoPlistKey
      ) as? String,
      let defaults = UserDefaults(suiteName: appGroupIdentifier),
      let json = defaults.string(forKey: cacheKey),
      let data = json.data(using: .utf8),
      let payload = try? JSONDecoder().decode(TopShelfCachePayload.self, from: data)
    else {
      completionHandler(nil)
      return
    }

    let apiKey = readAPIKey()
    let content = makeTopShelfContent(from: payload, apiKey: apiKey)
    completionHandler(content)
  }

  private func makeTopShelfContent(
    from payload: TopShelfCachePayload,
    apiKey: String?
  ) -> TVTopShelfContent? {
    switch payload.layout ?? .sectioned {
    case .carousel:
      return makeCarouselContent(from: payload.sections, apiKey: apiKey)
        ?? makeSectionedContent(from: payload.sections, apiKey: apiKey)
    case .inset:
      return makeInsetContent(from: payload.sections, apiKey: apiKey)
        ?? makeSectionedContent(from: payload.sections, apiKey: apiKey)
    case .sectioned:
      return makeSectionedContent(from: payload.sections, apiKey: apiKey)
    }
  }

  private func makeSectionedContent(
    from sections: [TopShelfCacheSection],
    apiKey: String?
  ) -> TVTopShelfSectionedContent? {
    let collections = sections.compactMap { section -> TVTopShelfItemCollection<TVTopShelfSectionedItem>? in
      let items = section.items.compactMap {
        makeSectionedItem($0, apiKey: apiKey)
      }
      guard !items.isEmpty else { return nil }

      let collection = TVTopShelfItemCollection(items: items)
      collection.title = section.title
      return collection
    }

    guard !collections.isEmpty else {
      return nil
    }

    return TVTopShelfSectionedContent(sections: collections)
  }

  private func makeInsetContent(
    from sections: [TopShelfCacheSection],
    apiKey: String?
  ) -> TVTopShelfInsetContent? {
    let items = sections
      .flatMap(\.items)
      .compactMap { makeSectionedItem($0, apiKey: apiKey) }

    guard !items.isEmpty else {
      return nil
    }

    return TVTopShelfInsetContent(items: items)
  }

  private func makeCarouselContent(
    from sections: [TopShelfCacheSection],
    apiKey: String?
  ) -> TVTopShelfCarouselContent? {
    let items = sections
      .flatMap { section in
        section.items.compactMap { item in
          makeCarouselItem(item, sectionTitle: section.title, apiKey: apiKey)
        }
      }

    guard !items.isEmpty else {
      return nil
    }

    return TVTopShelfCarouselContent(style: .details, items: items)
  }

  private func makeSectionedItem(
    _ cacheItem: TopShelfCacheItem,
    apiKey: String?
  ) -> TVTopShelfSectionedItem? {
    guard let route = URL(string: cacheItem.route) else {
      return nil
    }

    let item = TVTopShelfSectionedItem(identifier: cacheItem.id)
    item.title = cacheItem.title
    item.imageShape = .hdtv
    item.displayAction = TVTopShelfAction(url: route)

    if let playRoute = cacheItem.playRoute, let playURL = URL(string: playRoute) {
      item.playAction = TVTopShelfAction(url: playURL)
    }

    if let imageUrl = cacheItem.imageUrl,
       let url = imageURL(from: imageUrl, apiKey: apiKey) {
      item.setImageURL(url, for: .screenScale1x)
      item.setImageURL(url, for: .screenScale2x)
    }

    return item
  }

  private func makeCarouselItem(
    _ cacheItem: TopShelfCacheItem,
    sectionTitle: String,
    apiKey: String?
  ) -> TVTopShelfCarouselItem? {
    guard let route = URL(string: cacheItem.route) else {
      return nil
    }

    let item = TVTopShelfCarouselItem(identifier: cacheItem.id)
    item.title = cacheItem.title
    item.contextTitle = cacheItem.contextTitle ?? sectionTitle
    item.summary = cacheItem.carouselSummary ?? cacheItem.overview ?? cacheItem.subtitle
    item.genre = cacheItem.genre

    // tvOS renders the standard 4K / HDR / Dolby Vision / Atmos / CC glyphs for
    // these itself — carousel items are the only shelf item type with the slot.
    item.mediaOptions = mediaOptions(from: cacheItem.badges)

    // namedAttributes is the only slot Top Shelf offers for cast/director —
    // there is no dedicated property for either on TVTopShelfCarouselItem.
    // Labels are looked up from this extension's own Localizable.strings
    // (Bundle.main resolves to the extension's bundle here, not the host
    // app's). Duration is not duplicated here: tvOS already renders
    // item.duration below inline with genre and year (e.g. "Action  2002  2h 1min").
    var namedAttributes: [TVTopShelfNamedAttribute] = []

    if let cast = cacheItem.cast, !cast.isEmpty {
      let label = NSLocalizedString(
        "topshelf.starring",
        comment: "Top Shelf carousel cast attribute label"
      )
      namedAttributes.append(TVTopShelfNamedAttribute(name: label, values: cast))
    }

    if let director = cacheItem.director, !director.isEmpty {
      let label = NSLocalizedString(
        "topshelf.director",
        comment: "Top Shelf carousel director attribute label"
      )
      namedAttributes.append(TVTopShelfNamedAttribute(name: label, values: director))
    }

    if !namedAttributes.isEmpty {
      item.namedAttributes = namedAttributes
    }

    if let durationSeconds = cacheItem.durationSeconds {
      item.duration = durationSeconds
    }

    if let releaseDate = cacheItem.releaseDate {
      item.creationDate = parseDate(releaseDate)
    }

    item.displayAction = TVTopShelfAction(url: route)

    if let playRoute = cacheItem.playRoute, let playURL = URL(string: playRoute) {
      item.playAction = TVTopShelfAction(url: playURL)
    }

    if let imageUrl = cacheItem.imageUrl,
       let url = imageURL(from: imageUrl, apiKey: apiKey) {
      item.setImageURL(url, for: .screenScale1x)
      item.setImageURL(url, for: .screenScale2x)
    }

    return item
  }

  /// Maps the payload's quality tokens onto the native carousel media badges.
  /// Token strings come from constants/MediaQuality.ts; unknown ones are
  /// ignored. tvOS has no HDR10/HDR10+/HLG distinction, so they all fold into
  /// `.videoColorSpaceHDR`.
  private func mediaOptions(
    from badges: [String]?
  ) -> TVTopShelfCarouselItem.MediaOptions {
    guard let badges else { return [] }

    var options: TVTopShelfCarouselItem.MediaOptions = []
    for badge in badges {
      switch badge {
      case "4K":
        options.insert(.videoResolution4K)
      case "Dolby Vision":
        options.insert(.videoColorSpaceDolbyVision)
      case "HDR", "HDR10", "HDR10+", "HLG":
        options.insert(.videoColorSpaceHDR)
      case "Atmos":
        options.insert(.audioDolbyAtmos)
      case "CC":
        options.insert(.audioTranscriptionClosedCaptioning)
      case "SDH":
        options.insert(.audioTranscriptionSDH)
      case "AD":
        options.insert(.audioDescription)
      default:
        break
      }
    }
    return options
  }

  private func parseDate(_ value: String) -> Date? {
    let iso8601WithFractional = ISO8601DateFormatter()
    iso8601WithFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = iso8601WithFractional.date(from: value) {
      return date
    }

    let iso8601 = ISO8601DateFormatter()
    iso8601.formatOptions = [.withInternetDateTime]
    return iso8601.date(from: value)
  }

  private func imageURL(from imageUrl: String, apiKey: String?) -> URL? {
    guard var components = URLComponents(string: imageUrl) else {
      return nil
    }

    if let apiKey, !apiKey.isEmpty {
      var queryItems = components.queryItems ?? []
      queryItems.removeAll { $0.name == "api_key" }
      queryItems.append(URLQueryItem(name: "api_key", value: apiKey))
      components.queryItems = queryItems
    }

    return components.url
  }

  private func readAPIKey() -> String? {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: apiKeyService,
      kSecAttrAccount as String: apiKeyAccount,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]

    if let keychainAccessGroupIdentifier = Bundle.main.object(
      forInfoDictionaryKey: keychainAccessGroupInfoPlistKey
    ) as? String {
      query[kSecAttrAccessGroup as String] = keychainAccessGroupIdentifier
    }

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard
      status == errSecSuccess,
      let data = item as? Data
    else {
      return nil
    }

    return String(data: data, encoding: .utf8)
  }
}
