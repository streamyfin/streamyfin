import Foundation
import Security
import TVServices

private let appGroupInfoPlistKey = "StreamyfinAppGroupIdentifier"
private let keychainAccessGroupInfoPlistKey = "StreamyfinKeychainAccessGroupIdentifier"
private let cacheKey = "TopShelfCache"
private let apiKeyService = "StreamyfinTopShelf"
private let apiKeyAccount = "JellyfinApiKey"

private struct TopShelfCachePayload: Decodable {
  let sections: [TopShelfCacheSection]
}

private struct TopShelfCacheSection: Decodable {
  let title: String
  let items: [TopShelfCacheItem]
}

private struct TopShelfCacheItem: Decodable {
  let id: String
  let title: String
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
    let sections = payload.sections.compactMap { section -> TVTopShelfItemCollection<TVTopShelfSectionedItem>? in
      let items = section.items.compactMap { makeTopShelfItem($0, apiKey: apiKey) }
      guard !items.isEmpty else { return nil }

      let collection = TVTopShelfItemCollection(items: items)
      collection.title = section.title
      return collection
    }

    completionHandler(sections.isEmpty ? nil : TVTopShelfSectionedContent(sections: sections))
  }

  private func makeTopShelfItem(
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
