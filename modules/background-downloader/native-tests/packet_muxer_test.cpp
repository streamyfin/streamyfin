#include "PacketMuxer.hpp"
#include <cassert>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>

using Bytes = std::vector<uint8_t>;
Bytes Hex(const std::string& text) {
  Bytes bytes;
  for (size_t i = 0; i < text.size(); i += 2)
    bytes.push_back(std::stoi(text.substr(i, 2), nullptr, 16));
  return bytes;
}

// A portable demux-fixture harness: tests supply source packet file offsets from
// ffprobe. Packet bytes are read directly from MP4, not decoded or re-encoded.
int main(int argc, char** argv) {
  try {
    if (argc != 3) throw std::runtime_error("MANIFEST OUTPUT");
    std::ifstream manifest(argv[1]);
    if (!manifest) throw std::runtime_error("Missing manifest");
    std::string avccHex;
    int width, height, count;
    manifest >> avccHex >> width >> height >> count;
    std::vector<streamyfin::AudioConfig> audio;
    std::vector<std::ifstream> files;
    for (int i = 0; i < count; ++i) {
      std::string path, asc, language;
      int rate, channels;
      manifest >> path >> asc >> rate >> channels >> language;
      files.emplace_back(path, std::ios::binary);
      audio.push_back({Hex(asc), rate, channels, "Audio " + std::to_string(i), language});
    }
    auto avcc = Hex(avccHex);
    // Android MediaExtractor exposes SPS/PPS and AVC samples as Annex B.
    Bytes annex;
    size_t offset = 6;
    for (int kind = 0; kind < 2; ++kind) {
      int count = kind == 0 ? avcc[5] & 31 : avcc[offset++];
      for (int i = 0; i < count; ++i) {
        int length = (avcc[offset] << 8) | avcc[offset + 1];
        offset += 2;
        annex.insert(annex.end(), {0, 0, 0, 1});
        annex.insert(annex.end(), avcc.begin() + offset, avcc.begin() + offset + length);
        offset += length;
      }
    }
    if (streamyfin::AvccFromAnnexB(annex.data(), annex.size()) != avcc)
      throw std::runtime_error("Annex B codec conversion changed AVC configuration");
    streamyfin::PacketMuxer muxer(argv[2], avcc, width, height, audio);
    int track, file, key;
    size_t size;
    int64_t position, pts, duration;
    while (manifest >> track >> file >> position >> size >> pts >> duration >> key) {
      Bytes bytes(size);
      files[file].seekg(position);
      files[file].read(reinterpret_cast<char*>(bytes.data()), size);
      if (!files[file]) throw std::runtime_error("Cannot read fixture packet");
      if (track == 0) {
        Bytes annex;
        for (size_t pos = 0; pos < bytes.size();) {
          uint32_t length = 0;
          for (int j = 0; j < 4; ++j) length = (length << 8) | bytes[pos++];
          annex.insert(annex.end(), {0, 0, 0, 1});
          annex.insert(annex.end(), bytes.begin() + pos, bytes.begin() + pos + length);
          pos += length;
        }
        if (streamyfin::AvcPacketFromAnnexB(annex.data(), annex.size()) != bytes)
          throw std::runtime_error("Annex B conversion changed AVC packet");
      }
      muxer.Write(track, bytes.data(), bytes.size(), pts, duration, key);
    }
    muxer.Finish();
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
