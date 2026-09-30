#include "PacketMuxer.hpp"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <utility>
#include <fcntl.h>
#include <unistd.h>

#include "mkvmuxer/mkvmuxer.h"
#include "mkvparser/mkvparser.h"

namespace streamyfin {
namespace {
void Require(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

constexpr int64_t kTimecodeScaleNs = 1000;  // Microsecond precision for AAC sync.
constexpr uint64_t kClusterDurationNs = 30'000'000;  // Fits signed 16-bit block timecodes.
constexpr size_t kMaxCodecPrivateBytes = 1024 * 1024;

class File final : public mkvmuxer::IMkvWriter, public mkvparser::IMkvReader {
 public:
  explicit File(const std::string& path) : path_(path) {
    int descriptor = open(path.c_str(), O_RDWR | O_CREAT | O_EXCL, 0600);
    Require(descriptor >= 0, "Cannot exclusively create remux output");
    file_ = fdopen(descriptor, "w+b");
    if (!file_) {
      close(descriptor);
      remove(path.c_str());
      throw std::runtime_error("Cannot open remux output stream");
    }
  }
  ~File() override {
    if (file_) fclose(file_);
    if (!keep_) remove(path_.c_str());
  }
  mkvmuxer::int32 Write(const void* data, mkvmuxer::uint32 size) override {
    return fwrite(data, 1, size, file_) == size ? 0 : -1;
  }
  mkvmuxer::int64 Position() const override { return ftello(file_); }
  mkvmuxer::int32 Position(mkvmuxer::int64 pos) override {
    return fseeko(file_, pos, SEEK_SET);
  }
  bool Seekable() const override { return true; }
  void ElementStartNotify(mkvmuxer::uint64, mkvmuxer::int64) override {}
  int Read(long long pos, long size, unsigned char* buffer) override {
    if (pos < 0 || size < 0 || fseeko(file_, pos, SEEK_SET)) return -1;
    return fread(buffer, 1, size, file_) == static_cast<size_t>(size) ? 0 : -1;
  }
  int Length(long long* total, long long* available) override {
    if (fseeko(file_, 0, SEEK_END)) return -1;
    *total = *available = ftello(file_);
    return *total >= 0 ? 0 : -1;
  }
  void Flush() { Require(fflush(file_) == 0 && !ferror(file_), "Remux output flush failed"); }
  void Close() {
    FILE* file = std::exchange(file_, nullptr);
    Require(fclose(file) == 0, "Remux output close failed");
    keep_ = true;
  }
 private:
  FILE* file_ = nullptr;
  std::string path_;
  bool keep_ = false;
};

using Bytes = std::vector<uint8_t>;
std::vector<Bytes> Nals(const uint8_t* data, size_t size) {
  Require(data && size && size <= kMaxPacketBytes, "Invalid AVC packet size");
  std::vector<Bytes> nals;
  auto prefix = [&](size_t at) -> size_t {
    if (at + 3 <= size && data[at] == 0 && data[at + 1] == 0) {
      if (data[at + 2] == 1) return 3;
      if (at + 4 <= size && data[at + 2] == 0 && data[at + 3] == 1) return 4;
    }
    return 0;
  };
  Require(prefix(0) != 0, "Expected Annex B AVC packet");
  size_t start = prefix(0);
  for (size_t at = start; at <= size;) {
    size_t length = at == size ? 0 : prefix(at);
    if (at == size || length) {
      Require(at > start, "Empty AVC NAL unit");
      nals.emplace_back(data + start, data + at);
      if (at == size) break;
      start = at += length;
    } else {
      ++at;
    }
  }
  return nals;
}

void ValidateAvcc(const Bytes& avcc) {
  Require(avcc.size() >= 7 && avcc.size() <= kMaxCodecPrivateBytes &&
          avcc[0] == 1 && avcc[1] == 66 && (avcc[4] & 3) == 3,
          "Only H.264 Baseline with four-byte NAL lengths is supported");
  size_t offset = 6;
  auto readNals = [&](size_t count, int type) {
    Require(count > 0, "Missing AVC parameter sets");
    for (size_t i = 0; i < count; ++i) {
      Require(offset + 2 <= avcc.size(), "Truncated avcC");
      size_t length = (avcc[offset] << 8) | avcc[offset + 1];
      offset += 2;
      Require(length && offset + length <= avcc.size() &&
              (avcc[offset] & 31) == type, "Invalid AVC parameter set");
      offset += length;
    }
  };
  readNals(avcc[5] & 31, 7);
  Require(offset < avcc.size(), "Missing AVC PPS");
  size_t count = avcc[offset++];
  readNals(count, 8);
  Require(offset == avcc.size(), "Unsupported avcC extension");
}

void ValidateAudio(const AudioConfig& audio) {
  static constexpr int rates[] = {96000, 88200, 64000, 48000, 44100, 32000,
                                  24000, 22050, 16000, 12000, 11025, 8000, 7350};
  const auto& asc = audio.privateData;
  Require(asc.size() >= 2 && asc.size() <= kMaxCodecPrivateBytes,
          "Missing AAC AudioSpecificConfig");
  const int objectType = asc[0] >> 3;
  const int frequencyIndex = ((asc[0] & 7) << 1) | (asc[1] >> 7);
  const int channels = (asc[1] >> 3) & 15;
  Require(objectType == 2 && frequencyIndex < 13 && channels >= 1 && channels <= 2 &&
          audio.channels == channels && rates[frequencyIndex] == audio.sampleRate &&
          (asc[1] & 7) == 0, "Only AAC-LC mono/stereo with 1024-sample frames is supported");
  if (asc.size() > 2) {
    // FFmpeg adds a backwards-compatible SBR extension with sbrPresentFlag=0.
    // Reject HE-AAC rather than mislabelling an AAC-LC core as the whole stream.
    Require(asc.size() == 5 && asc[2] == 0x56 && asc[3] == 0xe5 && asc[4] == 0,
            "Unsupported AAC extension (HE-AAC is not supported)");
  }
  Require(audio.title.size() <= 4096 && audio.language.size() <= 63 &&
          audio.title.find('\0') == std::string::npos &&
          audio.language.find('\0') == std::string::npos, "Invalid audio metadata");
}
}  // namespace

Bytes AvccFromAnnexB(const uint8_t* data, size_t size) {
  auto nals = Nals(data, size);
  std::vector<Bytes> sps, pps;
  for (const auto& nal : nals) {
    if ((nal[0] & 31) == 7) sps.push_back(nal);
    else if ((nal[0] & 31) == 8) pps.push_back(nal);
    else throw std::runtime_error("Unexpected AVC configuration NAL");
  }
  Require(!sps.empty() && sps[0].size() >= 4 && sps.size() <= 31 &&
          !pps.empty() && pps.size() <= 255, "Missing AVC configuration");
  Bytes result{1, sps[0][1], sps[0][2], sps[0][3], 0xff,
               static_cast<uint8_t>(0xe0 | sps.size())};
  auto append = [&](const Bytes& nal) {
    Require(nal.size() <= 65535, "AVC parameter set too large");
    result.push_back(nal.size() >> 8);
    result.push_back(nal.size() & 255);
    result.insert(result.end(), nal.begin(), nal.end());
  };
  for (const auto& nal : sps) append(nal);
  result.push_back(pps.size());
  for (const auto& nal : pps) append(nal);
  ValidateAvcc(result);
  return result;
}

Bytes AvcPacketFromAnnexB(const uint8_t* data, size_t size) {
  Bytes result;
  for (const auto& nal : Nals(data, size)) {
    uint32_t length = static_cast<uint32_t>(nal.size());
    for (int shift : {24, 16, 8, 0}) result.push_back((length >> shift) & 255);
    result.insert(result.end(), nal.begin(), nal.end());
  }
  Require(result.size() <= kMaxPacketBytes, "AVC packet exceeds limit");
  return result;
}

Bytes AacConfigFromEsds(const uint8_t* data, size_t size) {
  Require(data && size >= 2 && size <= kMaxCodecPrivateBytes, "Missing AAC configuration");
  // Some readers expose the ASC directly, others the MP4 ES descriptor/full box.
  if ((data[0] >> 3) == 2) return Bytes(data, data + size);
  size_t offset = size > 4 && data[0] == 0 ? 4 : 0;
  size_t end = size;
  for (int depth = 0; depth < 4 && offset < end; ++depth) {
    uint8_t tag = data[offset++];
    size_t length = 0;
    bool complete = false;
    for (int i = 0; i < 4 && offset < end; ++i) {
      uint8_t byte = data[offset++];
      length = (length << 7) | (byte & 127);
      if (!(byte & 128)) { complete = true; break; }
    }
    Require(complete && length <= end - offset, "Invalid AAC descriptor length");
    end = offset + length;
    if (tag == 5) return Bytes(data + offset, data + end);
    if (tag == 3) {
      Require(length >= 3, "Invalid ES descriptor");
      uint8_t flags = data[offset + 2];
      offset += 3;
      if (flags & 0x80) offset += 2;
      if (flags & 0x40) {
        Require(offset < end, "Invalid ES URL");
        offset += 1 + data[offset];
      }
      if (flags & 0x20) offset += 2;
    } else if (tag == 4) {
      Require(length >= 13 && data[offset] == 0x40, "Only MPEG-4 AAC is supported");
      offset += 13;
    } else {
      break;
    }
    Require(offset < end, "Invalid AAC descriptor");
  }
  throw std::runtime_error("AAC AudioSpecificConfig not found");
}

struct PacketMuxer::Impl {
  File file;
  mkvmuxer::Segment segment;
  std::vector<uint64_t> packets;
  std::vector<int64_t> lastPts;
  int64_t lastGlobalPts = -1;
  int64_t endNs = 0;
  bool finished = false;
  explicit Impl(const std::string& path) : file(path) {}
};

PacketMuxer::PacketMuxer(const std::string& path, const Bytes& avcc,
                         int width, int height, const std::vector<AudioConfig>& audio) {
  ValidateAvcc(avcc);
  Require(width > 0 && height > 0 && !audio.empty() && audio.size() <= kMaxAudioTracks,
          "Invalid remux track configuration");
  for (const auto& config : audio) ValidateAudio(config);
  impl_ = std::make_unique<Impl>(path);
  auto& segment = impl_->segment;
  Require(segment.Init(&impl_->file), "Cannot initialize Matroska segment");
  segment.set_mode(mkvmuxer::Segment::kFile);
  segment.GetSegmentInfo()->set_timecode_scale(kTimecodeScaleNs);
  segment.GetSegmentInfo()->set_writing_app("Streamyfin packet-copy remuxer");
  segment.set_max_cluster_duration(kClusterDurationNs);
  segment.OutputCues(true);
  Require(segment.AddVideoTrack(width, height, 1) == 1, "Cannot add video track");
  auto* video = segment.GetTrackByNumber(1);
  video->set_codec_id("V_MPEG4/ISO/AVC");
  Require(video->SetCodecPrivate(avcc.data(), avcc.size()), "Cannot set AVC configuration");
  Require(segment.CuesTrack(1), "Cannot configure video cues");
  for (size_t i = 0; i < audio.size(); ++i) {
    auto& config = audio[i];
    int number = static_cast<int>(i + 2);
    Require(segment.AddAudioTrack(config.sampleRate, config.channels, number) ==
            static_cast<uint64_t>(number), "Cannot add audio track");
    auto* track = segment.GetTrackByNumber(number);
    track->set_codec_id("A_AAC");
    track->set_name(config.title.c_str());
    track->set_language(config.language.empty() ? "und" : config.language.c_str());
    track->set_default_track(i == 0);
    Require(track->SetCodecPrivate(config.privateData.data(), config.privateData.size()),
            "Cannot set AAC configuration");
  }
  impl_->packets.resize(audio.size() + 1);
  impl_->lastPts.resize(audio.size() + 1, -1);
}

PacketMuxer::~PacketMuxer() = default;

void PacketMuxer::Write(size_t track, const uint8_t* data, size_t size,
                        int64_t ptsNs, int64_t durationNs, bool keyframe) {
  auto& state = *impl_;
  Require(!state.finished && track < state.packets.size() && data && size &&
          size <= kMaxPacketBytes, "Invalid remux packet");
  Require(ptsNs >= 0 && ptsNs >= state.lastGlobalPts &&
          ptsNs > state.lastPts[track] && durationNs > 0 &&
          ptsNs <= std::numeric_limits<int64_t>::max() - durationNs,
          "Unsupported non-monotonic or invalid packet timestamps");
  if (track == 0) {
    Require(state.packets[0] || keyframe, "Video must start with a keyframe");
    size_t offset = 0;
    while (offset + 4 <= size) {
      uint32_t length = 0;
      for (int i = 0; i < 4; ++i) length = (length << 8) | data[offset++];
      Require(length && length <= size - offset, "Invalid length-prefixed AVC packet");
      offset += length;
    }
    Require(offset == size, "Truncated AVC packet");
  }
  Require(state.segment.AddFrame(data, size, track + 1, ptsNs, keyframe),
          "Matroska packet write failed");
  ++state.packets[track];
  state.lastPts[track] = state.lastGlobalPts = ptsNs;
  state.endNs = std::max(state.endNs, ptsNs + durationNs);
}

void PacketMuxer::Finish() {
  auto& state = *impl_;
  Require(!state.finished, "Remux already finalized");
  for (auto count : state.packets) Require(count > 0, "Input track has no packets");
  state.segment.set_duration(static_cast<double>(state.endNs) / kTimecodeScaleNs);
  Require(state.segment.Finalize(), "Matroska finalization failed");
  state.file.Flush();
  // Parse the finalized index/header, without loading media payloads.
  mkvparser::EBMLHeader header;
  long long position = 0;
  Require(header.Parse(&state.file, position) == 0, "Invalid Matroska header");
  mkvparser::Segment* rawSegment = nullptr;
  Require(mkvparser::Segment::CreateInstance(&state.file, position, rawSegment) == 0,
          "Cannot validate Matroska segment");
  std::unique_ptr<mkvparser::Segment> parsed(rawSegment);
  Require(parsed->ParseHeaders() >= 0 && parsed->GetTracks() &&
          parsed->GetTracks()->GetTracksCount() == state.packets.size() &&
          parsed->GetInfo() && parsed->GetInfo()->GetDuration() > 0 &&
          parsed->GetSeekHead(), "Finalized Matroska is missing tracks, duration or seek index");
  auto* seek = parsed->GetSeekHead();
  for (int i = 0; i < seek->GetCount(); ++i) {
    auto* entry = seek->GetEntry(i);
    if (entry && entry->id == libwebm::kMkvCues) {
      long length = 0;
      Require(parsed->ParseCues(entry->pos, position, length) == 0,
              "Invalid Matroska cues");
      break;
    }
  }
  Require(parsed->GetCues() && parsed->GetCues()->LoadCuePoint() &&
          parsed->GetCues()->GetFirst(), "Finalized Matroska is missing video cues");
  state.file.Close();
  state.finished = true;
}
}  // namespace streamyfin
