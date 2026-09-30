#import "DownloadRemuxerBridge.h"
#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>

#include "remux/PacketMuxer.hpp"
#include <algorithm>
#include <cmath>
#include <memory>
#include <stdexcept>
#include <vector>

namespace {
using streamyfin::AudioConfig;
using Bytes = std::vector<uint8_t>;

struct Cancelled : std::runtime_error {
  Cancelled() : std::runtime_error("Download remux cancelled") {}
};

void Check(bool value, const char *message) {
  if (!value) throw std::runtime_error(message);
}

int64_t TimeNs(CMTime time) {
  Check(CMTIME_IS_NUMERIC(time), "Invalid MP4 timestamp");
  CMTime converted = CMTimeConvertScale(time, 1000000000, kCMTimeRoundingMethod_RoundHalfAwayFromZero);
  Check(CMTIME_IS_NUMERIC(converted), "MP4 timestamp exceeds supported range");
  return converted.value;
}

Bytes Data(NSData *data) {
  Check(data != nil && data.length > 0 && data.length <= streamyfin::kMaxPacketBytes,
        "Missing or oversized codec configuration");
  const auto *start = static_cast<const uint8_t *>(data.bytes);
  return Bytes(start, start + data.length);
}

NSData *Atom(CMFormatDescriptionRef format, NSString *name) {
  NSDictionary *extensions = (__bridge NSDictionary *)CMFormatDescriptionGetExtensions(format);
  return extensions[(__bridge NSString *)kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms][name];
}

Bytes AudioPrivate(CMFormatDescriptionRef format) {
  NSData *esds = Atom(format, @"esds");
  if (esds) {
    return streamyfin::AacConfigFromEsds(static_cast<const uint8_t *>(esds.bytes), esds.length);
  }
  size_t size = 0;
  auto *cookie = static_cast<const uint8_t *>(CMAudioFormatDescriptionGetMagicCookie(format, &size));
  return streamyfin::AacConfigFromEsds(cookie, size);
}

struct Input {
  __strong AVAssetReader *reader;
  __strong AVAssetReaderTrackOutput *output;
  CMFormatDescriptionRef format;
  CMSampleBufferRef sample = nullptr;
  Bytes bytes;
  int64_t pts = 0;
  int64_t duration = 0;
  bool keyframe = false;
  bool video;
  bool eof = false;
  int64_t lastPts = INT64_MIN;
  CMItemCount sampleIndex = 0;
  size_t sampleOffset = 0;

  Input(AVAsset *asset, AVAssetTrack *track, bool isVideo) : video(isVideo) {
    Check(track.formatDescriptions.count == 1, "Changing MP4 codec configuration is unsupported");
    format = (__bridge CMFormatDescriptionRef)track.formatDescriptions.firstObject;
    NSError *error = nil;
    reader = [[AVAssetReader alloc] initWithAsset:asset error:&error];
    Check(reader != nil, "Cannot open MP4 reader");
    output = [[AVAssetReaderTrackOutput alloc] initWithTrack:track outputSettings:nil];
    output.alwaysCopiesSampleData = NO;
    Check([reader canAddOutput:output], "Cannot read compressed MP4 track");
    [reader addOutput:output];
    Check([reader startReading], "Cannot start compressed MP4 reader");
    CFRetain(format);
  }
  ~Input() {
    if (sample) CFRelease(sample);
    [reader cancelReading];
    CFRelease(format);
  }
  void Next(BOOL (^isCancelled)(void)) {
    if (sample && sampleIndex == CMSampleBufferGetNumSamples(sample)) {
      CFRelease(sample);
      sample = nullptr;
    }
    bytes.clear();
    while (!sample) {
      if (isCancelled()) throw Cancelled();
      sample = [output copyNextSampleBuffer];
      if (!sample) {
        Check(reader.status == AVAssetReaderStatusCompleted, "MP4 packet reader failed");
        eof = true;
        return;
      }
      if (CMSampleBufferGetNumSamples(sample) > 0) {
        sampleIndex = 0;
        sampleOffset = 0;
        break;
      }
      // AVAssetReader emits edit-list boundary markers with no media payload.
      CFRelease(sample);
      sample = nullptr;
    }
    auto sampleFormat = CMSampleBufferGetFormatDescription(sample);
    Check(sampleFormat && CMFormatDescriptionGetMediaSubType(format) ==
          CMFormatDescriptionGetMediaSubType(sampleFormat), "MP4 codec changed");
    // Reader descriptions can add harmless extensions (e.g. verbatim atoms).
    // Compare decoder configuration, rather than the whole extension dictionary.
    if (video) {
      Check([Atom(format, @"avcC") isEqual:Atom(sampleFormat, @"avcC")],
            "MP4 AVC configuration changed");
    } else {
      Check(AudioPrivate(format) == AudioPrivate(sampleFormat), "MP4 AAC configuration changed");
    }
    auto buffer = CMSampleBufferGetDataBuffer(sample);
    Check(buffer != nullptr, "Missing compressed MP4 packet");
    const size_t length = CMSampleBufferGetSampleSize(sample, sampleIndex);
    Check(length > 0 && CMBlockBufferGetDataLength(buffer) <= streamyfin::kMaxPacketBytes &&
          sampleOffset + length <= CMBlockBufferGetDataLength(buffer), "MP4 packet exceeds size limit");
    bytes.resize(length);
    Check(CMBlockBufferCopyDataBytes(buffer, sampleOffset, length, bytes.data()) == kCMBlockBufferNoErr,
          "Cannot read compressed MP4 packet");
    CMSampleTimingInfo timing;
    Check(CMSampleBufferGetSampleTimingInfo(sample, sampleIndex, &timing) == noErr,
          "Missing compressed MP4 packet timing");
    auto speedValue = static_cast<CFNumberRef>(
        CMGetAttachment(sample, kCMSampleBufferAttachmentKey_SpeedMultiplier, nullptr));
    if (speedValue) {
      double speed = 0;
      Check(CFNumberGetValue(speedValue, kCFNumberDoubleType, &speed) && speed == 1,
            "Time-scaled MP4 edits are unsupported");
    }
    Check(CMGetAttachment(sample, kCMSampleBufferAttachmentKey_Reverse, nullptr) != kCFBooleanTrue,
          "Reversed MP4 edits are unsupported");
    CMTime trim = kCMTimeZero;
    auto trimValue = static_cast<CFDictionaryRef>(
        CMGetAttachment(sample, kCMSampleBufferAttachmentKey_TrimDurationAtStart, nullptr));
    if (trimValue) trim = CMTimeMakeFromDictionary(trimValue);
    auto mappedStart = CMTimeSubtract(CMSampleBufferGetOutputPresentationTimeStamp(sample), trim);
    auto offset = CMTimeSubtract(timing.presentationTimeStamp,
                                CMSampleBufferGetPresentationTimeStamp(sample));
    pts = TimeNs(CMTimeAdd(mappedStart, offset));
    Check(!video || !CMTIME_IS_NUMERIC(timing.decodeTimeStamp) ||
          CMTimeCompare(timing.decodeTimeStamp, timing.presentationTimeStamp) == 0,
          "Reordered video packets are unsupported");
    duration = TimeNs(timing.duration);
    Check(duration > 0 && pts > lastPts, "Invalid MP4 packet timing");
    lastPts = pts;
    auto attachments = CMSampleBufferGetSampleAttachmentsArray(sample, false);
    NSDictionary *attachment = attachments && CFArrayGetCount(attachments) > sampleIndex ?
        (__bridge NSDictionary *)CFArrayGetValueAtIndex(attachments, sampleIndex) : nil;
    keyframe = ![attachment[(__bridge NSString *)kCMSampleAttachmentKey_NotSync] boolValue];
    ++sampleIndex;
    sampleOffset += length;
  }
};
}  // namespace

@implementation SFDownloadRemuxerBridge
+ (BOOL)remuxVideoPath:(NSString *)videoPath
           audioPaths:(NSArray<NSString *> *)audioPaths
          audioTitles:(NSArray<NSString *> *)audioTitles
       audioLanguages:(NSArray<NSString *> *)audioLanguages
           outputPath:(NSString *)outputPath
           onProgress:(void (^)(double))onProgress
          isCancelled:(BOOL (^)(void))isCancelled
                error:(NSError **)error {
  bool createdOutput = false;
  try {
    @autoreleasepool {
      Check(audioPaths.count + 1 == audioTitles.count &&
            audioTitles.count == audioLanguages.count &&
            audioTitles.count <= streamyfin::kMaxAudioTracks, "Invalid remux audio metadata");
      NSArray<NSString *> *paths = [@[videoPath] arrayByAddingObjectsFromArray:audioPaths];
      NSString *destination = outputPath.stringByStandardizingPath.stringByResolvingSymlinksInPath;
      Check(![[NSFileManager defaultManager] fileExistsAtPath:destination],
            "Remux output must be a new temporary file");
      for (NSString *path in paths) {
        Check(![path.stringByStandardizingPath.stringByResolvingSymlinksInPath isEqual:destination],
              "Remux output aliases an input");
      }
      auto cancelled = [&] { if (isCancelled()) throw Cancelled(); };
      cancelled();
      onProgress(0);
      std::vector<std::unique_ptr<Input>> inputs;
      std::vector<AudioConfig> audio;
      Bytes avcc;
      int width = 0, height = 0;
      int64_t totalDuration = 0;
      for (NSUInteger index = 0; index < paths.count; ++index) {
        cancelled();
        AVURLAsset *asset = [AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:paths[index]]
                                              options:@{AVURLAssetPreferPreciseDurationAndTimingKey: @YES}];
        Check(!asset.hasProtectedContent && asset.tracks.count == 2, "Expected one video and one audio track per MP4");
        NSArray<AVAssetTrack *> *videoTracks = [asset tracksWithMediaType:AVMediaTypeVideo];
        NSArray<AVAssetTrack *> *audioTracks = [asset tracksWithMediaType:AVMediaTypeAudio];
        Check(videoTracks.count == 1 && audioTracks.count == 1, "Expected one H.264 and one AAC track per MP4");
        Check(videoTracks[0].formatDescriptions.count == 1, "Invalid AVC format descriptions");
        CMFormatDescriptionRef videoFormat = (__bridge CMFormatDescriptionRef)videoTracks[0].formatDescriptions[0];
        Check(CMFormatDescriptionGetMediaSubType(videoFormat) == kCMVideoCodecType_H264,
              "Only H.264 input is supported");
        Bytes videoPrivate = Data(Atom(videoFormat, @"avcC"));
        Check(videoPrivate.size() > 1 && videoPrivate[1] == 66, "Only H.264 Baseline input is supported");
        if (index == 0) {
          auto dimensions = CMVideoFormatDescriptionGetDimensions(videoFormat);
          width = dimensions.width;
          height = dimensions.height;
          avcc = std::move(videoPrivate);
          inputs.push_back(std::make_unique<Input>(asset, videoTracks[0], true));
        }
        auto input = std::make_unique<Input>(asset, audioTracks[0], false);
        const auto *asbd = CMAudioFormatDescriptionGetStreamBasicDescription(input->format);
        Check(asbd && asbd->mFormatID == kAudioFormatMPEG4AAC &&
              asbd->mChannelsPerFrame >= 1 && asbd->mChannelsPerFrame <= 2 &&
              asbd->mFramesPerPacket == 1024,
              "Only AAC-LC mono/stereo input is supported");
        Bytes asc = AudioPrivate(input->format);
        audio.push_back({std::move(asc), static_cast<int>(asbd->mSampleRate),
                        static_cast<int>(asbd->mChannelsPerFrame),
                        audioTitles[index].UTF8String, audioLanguages[index].UTF8String});
        totalDuration = std::max(totalDuration, TimeNs(asset.duration));
        inputs.push_back(std::move(input));
      }
      int64_t origin = INT64_MAX;
      for (auto& input : inputs) {
        cancelled();
        input->Next(isCancelled);
        Check(!input->eof, "Empty MP4 input track");
        origin = std::min(origin, input->pts);
      }
      // A single shared shift retains every relative offset, including AAC priming.
      origin = std::min<int64_t>(origin, 0);
      streamyfin::PacketMuxer muxer(destination.fileSystemRepresentation, avcc, width, height, audio);
      createdOutput = true;
      double reported = 0;
      while (true) {
        @autoreleasepool {
          cancelled();
          Input *next = nullptr;
          size_t track = 0;
          for (size_t i = 0; i < inputs.size(); ++i) {
            if (!inputs[i]->eof && (!next || inputs[i]->pts < next->pts)) {
              next = inputs[i].get();
              track = i;
            }
          }
          if (!next) break;
          Check(origin >= 0 || next->pts <= INT64_MAX + origin,
                "MP4 timestamp exceeds supported range");
          muxer.Write(track, next->bytes.data(), next->bytes.size(), next->pts - origin,
                      next->duration, next->keyframe);
          double progress = std::min(0.99, static_cast<double>(next->pts - origin) /
                                            std::max(static_cast<double>(totalDuration) - origin, 1.0));
          if (progress - reported >= 0.01) { onProgress(progress); reported = progress; }
          next->Next(isCancelled);
        }
      }
      cancelled();
      muxer.Finish();
      cancelled();
      onProgress(1);
      return YES;
    }
  } catch (const std::exception& exception) {
    if (createdOutput) [[NSFileManager defaultManager] removeItemAtPath:outputPath error:nil];
    if (error) {
      *error = [NSError errorWithDomain:@"StreamyfinRemux"
                                  code:dynamic_cast<const Cancelled *>(&exception) ? 2 : 1
                              userInfo:@{NSLocalizedDescriptionKey: @(exception.what())}];
    }
    return NO;
  }
}
@end
