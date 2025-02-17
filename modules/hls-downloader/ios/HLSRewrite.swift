//
//  HLSRewrite.swift
//

import Foundation
import XMLCoder

// MARK: - Models

public struct Boot: Codable {
    public let Version: String
    public let HLSMoviePackageType: String
    public let Streams: Streams
    public let MasterPlaylist: MasterPlaylist
    public let DataItems: DataItems

    public struct Streams: Codable {
        public let Stream: [Stream]
    }
    public struct Stream: Codable {
        public let ID: String
        public let NetworkURL: String
        public let Path: String
        public let Complete: String
    }
    public struct MasterPlaylist: Codable {
        public let NetworkURL: String
    }
    public struct DataItems: Codable {
        public let Directory: String
        public let DataItem: DataItem
    }
    public struct DataItem: Codable {
        public let ID: String
        public let Category: String
        public let Name: String
        public let DescriptorPath: String
        public let DataPath: String
        public let Role: String
    }
}

public struct StreamInfo: Codable {
    public let Version: String
    public let Complete: String
    public let PeakBandwidth: Int
    public let Compressable: String
    public let MediaPlaylist: MediaPlaylist
    public let StreamType: String
    public let MediaSegments: MediaSegments
    public let EvictionPolicy: String
    public let MediaBytesStored: Int

    private enum CodingKeys: String, CodingKey {
        case Version
        case Complete
        case PeakBandwidth
        case Compressable
        case MediaPlaylist
        case StreamType = "Type"  // Map "Type" in XML to "StreamType" in Swift
        case MediaSegments
        case EvictionPolicy
        case MediaBytesStored
    }

    public struct MediaPlaylist: Codable {
        public let NetworkURL: String
        public let PathToLocalCopy: String?
    }
    public struct MediaSegments: Codable {
        public let SEG: [SEG]
    }
}

public struct SEG: Codable {
    public let Dur: Double
    public let Len: Double
    public let Off: Double
    public let PATH: String
    public let SeqNum: Int
    public let Tim: Double
    public let URL: String
}

// MARK: - XML Parsing Functions

public func parseBootXML(_ xml: String) throws -> Boot {
    let data = Data(xml.utf8)
    let decoder = XMLDecoder()
    decoder.shouldProcessNamespaces = false
    let boot = try decoder.decode(Boot.self, from: data)
    print(boot.Streams)
    return boot
}

public func parseStreamInfoXml(_ xml: String) throws -> StreamInfo {
    let data = Data(xml.utf8)
    let decoder = XMLDecoder()
    decoder.shouldProcessNamespaces = false
    return try decoder.decode(StreamInfo.self, from: data)
}

// MARK: - HLS Rewrite Functions

/// Entry point for rewriting m3u8 playlists with local paths.
public func rewriteM3U8Files(baseDir: String) async throws {
    guard let bootData = await loadBootData(baseDir: baseDir) else { return }
    let localPlaylistPaths = try await processAllStreams(baseDir: baseDir, bootData: bootData)
    let masterPath = URL(fileURLWithPath: baseDir)
        .appendingPathComponent("Data")
        .appendingPathComponent(bootData.DataItems.DataItem.DataPath)
        .path
    try await updateMasterPlaylist(masterPath: masterPath, localPlaylistPaths: localPlaylistPaths)
}

/// Loads and parses boot.xml from the base directory.
private func loadBootData(baseDir: String) async -> Boot? {
    let bootPath = URL(fileURLWithPath: baseDir).appendingPathComponent("boot.xml")
    do {
        guard FileManager.default.fileExists(atPath: bootPath.path) else { return nil }
        let bootXML = try String(contentsOf: bootPath, encoding: .utf8)
        return try parseBootXML(bootXML)
    } catch {
        print("Failed to load boot.xml from \(baseDir): \(error)")
        return nil
    }
}

/// Processes all stream directories from boot data.
private func processAllStreams(baseDir: String, bootData: Boot) async throws -> [String] {
    var localPaths = [String]()
    for stream in bootData.Streams.Stream {
        let streamDir = URL(fileURLWithPath: baseDir).appendingPathComponent(stream.ID)
        do {
            if let streamInfo = try await processStream(streamDir: streamDir.path),
                let localCopyPath = streamInfo.MediaPlaylist.PathToLocalCopy,
                !localCopyPath.isEmpty
            {
                let fullPath = URL(fileURLWithPath: streamDir.path)
                    .appendingPathComponent(localCopyPath)
                    .absoluteString  // Use absoluteString instead of path
                localPaths.append(fullPath)
            }
        } catch {
            print("Skipping stream \(stream.ID) due to error: \(error)")
        }
    }
    return localPaths
}

/// Updates the master playlist by replacing remote URIs with local playlist paths.
private func updateMasterPlaylist(masterPath: String, localPlaylistPaths: [String]) async throws {
    let masterURL = URL(fileURLWithPath: masterPath)
    do {
        let masterContent = try String(contentsOf: masterURL, encoding: .utf8)
        let updatedContent = updatePlaylistWithLocalSegments(
            content: masterContent, localPaths: localPlaylistPaths)
        try updatedContent.write(to: masterURL, atomically: true, encoding: .utf8)
    } catch {
        print("Error updating master playlist at \(masterPath): \(error)")
        throw error
    }
}

/// Updates an m3u8 playlist by replacing segment URIs with provided local paths.
public func updatePlaylistWithLocalSegments(content: String, localPaths: [String]) -> String {
    var lines = content.components(separatedBy: "\n")
    var index = 0
    for i in 0..<lines.count where index < localPaths.count {
        let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty, !trimmed.hasPrefix("#") {
            lines[i] = localPaths[index]
            index += 1
        }
    }
    return lines.joined(separator: "\n")
}

/// Processes a single stream directory: updates its local m3u8 playlist to reference local segment paths.
public func processStream(streamDir: String) async throws -> StreamInfo? {
    let streamInfoPath = URL(fileURLWithPath: streamDir).appendingPathComponent(
        "StreamInfoBoot.xml")
    do {
        let streamXML = try String(contentsOf: streamInfoPath, encoding: .utf8)
        let streamInfo = try parseStreamInfoXml(streamXML)

        guard let localPath = streamInfo.MediaPlaylist.PathToLocalCopy,
            !localPath.isEmpty
        else {
            print("No local m3u8 specified in \(streamDir); skipping.")
            return nil
        }

        let m3u8Path = URL(fileURLWithPath: streamDir).appendingPathComponent(localPath)
        let m3u8Content = try String(contentsOf: m3u8Path, encoding: .utf8)
        let localSegmentPaths = streamInfo.MediaSegments.SEG.map { seg in
            URL(fileURLWithPath: streamDir)
                .appendingPathComponent(seg.PATH)
                .absoluteString  // Use absoluteString instead of path
        }
        let updatedContent = updatePlaylistWithLocalSegments(
            content: m3u8Content, localPaths: localSegmentPaths)
        try updatedContent.write(to: m3u8Path, atomically: true, encoding: .utf8)
        return streamInfo
    } catch {
        print("Error processing stream at \(streamDir): \(error)")
        throw error
    }
}
