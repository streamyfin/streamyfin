import ExpoModulesCore
import Foundation
import Security
#if canImport(TVServices)
import TVServices
#endif

public class TopShelfCacheModule: Module {
  private let appGroupInfoPlistKey = "StreamyfinAppGroupIdentifier"
  private let keychainAccessGroupInfoPlistKey = "StreamyfinKeychainAccessGroupIdentifier"
  private let cacheKey = "TopShelfCache"
  private let apiKeyService = "StreamyfinTopShelf"
  private let apiKeyAccount = "JellyfinApiKey"
  private var appGroupIdentifier: String? {
    if let appGroupIdentifier = Bundle.main.object(
      forInfoDictionaryKey: appGroupInfoPlistKey
    ) as? String {
      return appGroupIdentifier
    }

    guard let bundleIdentifier = Bundle.main.bundleIdentifier else {
      return nil
    }

    return "group.\(bundleIdentifier)"
  }
  private var keychainAccessGroupIdentifier: String? {
    Bundle.main.object(forInfoDictionaryKey: keychainAccessGroupInfoPlistKey) as? String
  }

  public func definition() -> ModuleDefinition {
    Name("TopShelfCache")

    Function("writeCache") { (json: String, apiKey: String?) -> Bool in
      guard
        let appGroupIdentifier = appGroupIdentifier,
        let defaults = UserDefaults(suiteName: appGroupIdentifier)
      else {
        return false
      }

      defaults.set(json, forKey: cacheKey)
      defaults.set(Date().timeIntervalSince1970, forKey: "\(cacheKey)UpdatedAt")
      defaults.synchronize()
      let didSaveAPIKey = saveAPIKey(apiKey)

      #if canImport(TVServices)
      TVTopShelfContentProvider.topShelfContentDidChange()
      #endif

      return didSaveAPIKey
    }

    Function("clearCache") { () -> Bool in
      guard
        let appGroupIdentifier = appGroupIdentifier,
        let defaults = UserDefaults(suiteName: appGroupIdentifier)
      else {
        return false
      }

      defaults.removeObject(forKey: cacheKey)
      defaults.removeObject(forKey: "\(cacheKey)UpdatedAt")
      defaults.synchronize()
      let didDeleteAPIKey = deleteAPIKey()

      #if canImport(TVServices)
      TVTopShelfContentProvider.topShelfContentDidChange()
      #endif

      return didDeleteAPIKey
    }
  }

  private func baseAPIKeyQuery() -> [String: Any] {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: apiKeyService,
      kSecAttrAccount as String: apiKeyAccount
    ]

    if let keychainAccessGroupIdentifier {
      query[kSecAttrAccessGroup as String] = keychainAccessGroupIdentifier
    }

    return query
  }

  private func saveAPIKey(_ apiKey: String?) -> Bool {
    guard deleteAPIKey() else {
      return false
    }

    guard
      let apiKey,
      !apiKey.isEmpty,
      let data = apiKey.data(using: .utf8)
    else {
      return true
    }

    var query = baseAPIKeyQuery()
    query[kSecValueData as String] = data
    let status = SecItemAdd(query as CFDictionary, nil)
    return status == errSecSuccess
  }

  private func deleteAPIKey() -> Bool {
    let status = SecItemDelete(baseAPIKeyQuery() as CFDictionary)
    return status == errSecSuccess || status == errSecItemNotFound
  }
}
