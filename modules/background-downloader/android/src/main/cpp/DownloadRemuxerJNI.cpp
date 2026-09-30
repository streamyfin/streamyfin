#include <jni.h>
#include <stdexcept>
#include <string>
#include <vector>
#include "PacketMuxer.hpp"

namespace {
using Bytes = std::vector<uint8_t>;
void Throw(JNIEnv* env, const std::exception& error) {
  if (!env->ExceptionCheck()) {
    env->ThrowNew(env->FindClass("java/io/IOException"), error.what());
  }
}
Bytes Data(JNIEnv* env, jbyteArray array) {
  if (!array) throw std::runtime_error("Missing codec configuration");
  auto size = env->GetArrayLength(array);
  if (size <= 0 || size > static_cast<jsize>(streamyfin::kMaxPacketBytes))
    throw std::runtime_error("Invalid codec configuration size");
  Bytes data(size);
  env->GetByteArrayRegion(array, 0, size, reinterpret_cast<jbyte*>(data.data()));
  return data;
}
std::string String(JNIEnv* env, jstring string) {
  if (!string) throw std::runtime_error("Missing remux metadata");
  // JNI's modified UTF-8 encodes supplementary characters incorrectly for
  // Matroska. Ask Java for actual UTF-8 (also preserves non-ASCII filenames).
  jclass clazz = env->FindClass("java/lang/String");
  jmethodID method = env->GetMethodID(clazz, "getBytes", "(Ljava/lang/String;)[B");
  jstring charset = env->NewStringUTF("UTF-8");
  auto bytes = static_cast<jbyteArray>(env->CallObjectMethod(string, method, charset));
  env->DeleteLocalRef(charset);
  env->DeleteLocalRef(clazz);
  if (!bytes) throw std::runtime_error("Cannot encode remux metadata");
  jsize size = env->GetArrayLength(bytes);
  std::string value(size, '\0');
  env->GetByteArrayRegion(bytes, 0, size, reinterpret_cast<jbyte*>(value.data()));
  env->DeleteLocalRef(bytes);
  return value;
}
Bytes Avcc(JNIEnv* env, jbyteArray data) {
  Bytes bytes = Data(env, data);
  if (bytes[0] == 1) return bytes;
  return streamyfin::AvccFromAnnexB(bytes.data(), bytes.size());
}
streamyfin::PacketMuxer* Muxer(jlong value) {
  if (!value) throw std::runtime_error("Invalid remux handle");
  return reinterpret_cast<streamyfin::PacketMuxer*>(value);
}
}  // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_expo_modules_backgrounddownloader_DownloadRemuxer_nativeIsBaselineAvc(
    JNIEnv* env, jobject, jbyteArray config) {
  try {
    auto avcc = Avcc(env, config);
    return avcc.size() >= 7 && avcc[1] == 66 && (avcc[4] & 3) == 3;
  } catch (const std::exception& error) { Throw(env, error); return false; }
}

extern "C" JNIEXPORT jlong JNICALL
Java_expo_modules_backgrounddownloader_DownloadRemuxer_nativeCreate(
    JNIEnv* env, jobject, jstring path, jbyteArray avc, jint width, jint height,
    jobjectArray configs, jintArray rates, jintArray channels,
    jobjectArray titles, jobjectArray languages) {
  try {
    jsize count = env->GetArrayLength(configs);
    if (count < 1 || count > static_cast<jsize>(streamyfin::kMaxAudioTracks) ||
        env->GetArrayLength(rates) != count || env->GetArrayLength(channels) != count ||
        env->GetArrayLength(titles) != count || env->GetArrayLength(languages) != count)
      throw std::runtime_error("Invalid remux audio metadata");
    std::vector<jint> sampleRates(count), channelCounts(count);
    env->GetIntArrayRegion(rates, 0, count, sampleRates.data());
    env->GetIntArrayRegion(channels, 0, count, channelCounts.data());
    std::vector<streamyfin::AudioConfig> audio;
    for (jsize i = 0; i < count; ++i) {
      auto config = static_cast<jbyteArray>(env->GetObjectArrayElement(configs, i));
      auto title = static_cast<jstring>(env->GetObjectArrayElement(titles, i));
      auto language = static_cast<jstring>(env->GetObjectArrayElement(languages, i));
      audio.push_back({Data(env, config), sampleRates[i], channelCounts[i],
                       String(env, title), String(env, language)});
      env->DeleteLocalRef(config);
      env->DeleteLocalRef(title);
      env->DeleteLocalRef(language);
    }
    return reinterpret_cast<jlong>(new streamyfin::PacketMuxer(
        String(env, path), Avcc(env, avc), width, height, audio));
  } catch (const std::exception& error) { Throw(env, error); return 0; }
}

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_backgrounddownloader_DownloadRemuxer_nativeWrite(
    JNIEnv* env, jobject, jlong handle, jint track, jobject packet, jint size,
    jlong ptsNs, jlong durationNs, jboolean keyframe) {
  try {
    auto* data = static_cast<uint8_t*>(env->GetDirectBufferAddress(packet));
    if (!data || size <= 0 || size > env->GetDirectBufferCapacity(packet) ||
        size > static_cast<jint>(streamyfin::kMaxPacketBytes))
      throw std::runtime_error("Invalid remux packet buffer");
    Bytes avc;
    if (track == 0 && size >= 4 && data[0] == 0 && data[1] == 0 &&
        (data[2] == 1 || (data[2] == 0 && data[3] == 1))) {
      avc = streamyfin::AvcPacketFromAnnexB(data, size);
      data = avc.data();
      size = static_cast<jint>(avc.size());
    }
    Muxer(handle)->Write(track, data, size, ptsNs, durationNs, keyframe);
  } catch (const std::exception& error) { Throw(env, error); }
}

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_backgrounddownloader_DownloadRemuxer_nativeFinish(
    JNIEnv* env, jobject, jlong handle) {
  try { Muxer(handle)->Finish(); }
  catch (const std::exception& error) { Throw(env, error); }
}

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_backgrounddownloader_DownloadRemuxer_nativeDestroy(
    JNIEnv*, jobject, jlong handle) {
  delete reinterpret_cast<streamyfin::PacketMuxer*>(handle);
}
