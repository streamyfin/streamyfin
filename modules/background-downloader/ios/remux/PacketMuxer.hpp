#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace streamyfin {

// Hard limits bound allocations when reading malformed/untrusted media.
constexpr size_t kMaxPacketBytes = 32 * 1024 * 1024;
constexpr size_t kMaxAudioTracks = 32;

struct AudioConfig {
  std::vector<uint8_t> privateData;
  int sampleRate;
  int channels;
  std::string title;
  std::string language;
};

std::vector<uint8_t> AvccFromAnnexB(const uint8_t* data, size_t size);
std::vector<uint8_t> AvcPacketFromAnnexB(const uint8_t* data, size_t size);
std::vector<uint8_t> AacConfigFromEsds(const uint8_t* data, size_t size);

// All packets use a common, non-negative presentation timeline, in nanoseconds.
// The readers shift every track by the same earliest input timestamp.
class PacketMuxer {
 public:
  PacketMuxer(const std::string& path, const std::vector<uint8_t>& avcc,
              int width, int height, const std::vector<AudioConfig>& audio);
  ~PacketMuxer();
  void Write(size_t track, const uint8_t* data, size_t size, int64_t ptsNs,
             int64_t durationNs, bool keyframe);
  void Finish();
  PacketMuxer(const PacketMuxer&) = delete;
  PacketMuxer& operator=(const PacketMuxer&) = delete;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
}  // namespace streamyfin
