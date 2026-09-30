cmake_minimum_required(VERSION 3.22)
project(streamyfin_remux LANGUAGES CXX)

include(FetchContent)
file(READ "${CMAKE_CURRENT_LIST_DIR}/libwebm.json" LIBWEBM_MANIFEST)
string(JSON LIBWEBM_COMMIT GET "${LIBWEBM_MANIFEST}" commit)
FetchContent_Declare(libwebm
  GIT_REPOSITORY https://github.com/webmproject/libwebm.git
  GIT_TAG "${LIBWEBM_COMMIT}"
  UPDATE_DISCONNECTED TRUE
  PATCH_COMMAND "${CMAKE_COMMAND}"
    "-DPATCH=${CMAKE_CURRENT_LIST_DIR}/default-track.patch"
    -P "${CMAKE_CURRENT_LIST_DIR}/ApplyLibwebmPatch.cmake"
)
FetchContent_GetProperties(libwebm)
if(NOT libwebm_POPULATED)
  FetchContent_Populate(libwebm)
endif()

# Only the official muxer and its legacy-parser dependency; no codecs or FFmpeg.
add_library(streamyfin_webm STATIC
  "${libwebm_SOURCE_DIR}/mkvmuxer/mkvmuxer.cc"
  "${libwebm_SOURCE_DIR}/mkvmuxer/mkvmuxerutil.cc"
  "${libwebm_SOURCE_DIR}/mkvmuxer/mkvwriter.cc"
  "${libwebm_SOURCE_DIR}/mkvparser/mkvparser.cc"
)
target_include_directories(streamyfin_webm PUBLIC "${libwebm_SOURCE_DIR}")
set_target_properties(streamyfin_webm PROPERTIES
  POSITION_INDEPENDENT_CODE ON CXX_VISIBILITY_PRESET hidden)
target_compile_features(streamyfin_webm PUBLIC cxx_std_17)
target_compile_definitions(streamyfin_webm PUBLIC _FILE_OFFSET_BITS=64)

add_library(streamyfin_packet_muxer STATIC ../ios/remux/PacketMuxer.cpp)
target_link_libraries(streamyfin_packet_muxer PUBLIC streamyfin_webm)
target_include_directories(streamyfin_packet_muxer PUBLIC ../ios/remux)
set_target_properties(streamyfin_packet_muxer PROPERTIES
  POSITION_INDEPENDENT_CODE ON CXX_VISIBILITY_PRESET hidden)

if(ANDROID)
  add_library(streamyfin_remux SHARED ../android/src/main/cpp/DownloadRemuxerJNI.cpp)
  target_link_libraries(streamyfin_remux PRIVATE streamyfin_packet_muxer)
  target_link_options(streamyfin_remux PRIVATE
    "-Wl,-z,max-page-size=16384" "-Wl,--exclude-libs,ALL")
  set_target_properties(streamyfin_remux PROPERTIES CXX_VISIBILITY_PRESET hidden)
endif()

if(STREAMYFIN_REMUX_TESTS)
  add_executable(packet_muxer_test ../native-tests/packet_muxer_test.cpp)
  target_link_libraries(packet_muxer_test PRIVATE streamyfin_packet_muxer)
endif()
