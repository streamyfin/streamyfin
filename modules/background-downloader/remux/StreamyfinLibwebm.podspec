require 'json'
pin = JSON.parse(File.read(File.join(__dir__, 'libwebm.json')))

Pod::Spec.new do |s|
  s.name = 'StreamyfinLibwebm'
  s.version = pin.fetch('version')
  s.summary = 'Pinned official libwebm packet muxer for Streamyfin downloads'
  s.homepage = 'https://github.com/webmproject/libwebm'
  s.license = { :type => 'BSD', :file => 'LICENSE.TXT' }
  s.author = 'The WebM project authors'
  s.source = {
    :git => 'https://github.com/webmproject/libwebm.git',
    :commit => pin.fetch('commit')
  }
  s.platforms = { :ios => '15.6', :tvos => '15.0' }
  # libwebm does not expose Matroska FlagDefault. Keep this tiny API extension
  # identical to the Android source build instead of patching container bytes.
  patch = File.read(File.join(__dir__, 'default-track.patch'))
  s.prepare_command = "git apply --recount <<'STREAMYFIN_PATCH'\n#{patch}\nSTREAMYFIN_PATCH"
  s.source_files = 'mkvmuxer/*.{h,cc}', 'mkvparser/*.{h,cc}', 'common/webmids.h'
  s.header_mappings_dir = '.'
  s.preserve_paths = 'LICENSE.TXT', 'PATENTS.TXT', 'AUTHORS.TXT'
  s.module_map = false
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'GCC_SYMBOLS_PRIVATE_EXTERN' => 'YES',
    'DEFINES_MODULE' => 'NO',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}"'
  }
end
