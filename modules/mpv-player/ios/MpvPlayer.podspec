Pod::Spec.new do |s|
  s.name             = 'MpvPlayer'
  s.version          = '1.0.0'
  s.summary          = 'MPV-based video player for Streamyfin (Expo module)'
  s.author           = 'Streamyfin'
  s.homepage         = 'https://github.com/streamyfin/streamyfin'
  s.platforms        = { :ios => '15.1', :tvos => '15.1' }
  s.source           = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MPVKit'

  # Spatial audio for TrueHD Atmos and DTS:X (SpatialAudioSink.swift).
  spm_dependency(s,
    url: 'https://github.com/kristofferR/SpatialAudioBridge',
    requirement: { kind: 'upToNextMajorVersion', minimumVersion: '1.5.1' },
    products: ['SpatialAudioBridge', 'SpatialAudioPlayback']
  )

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # Builds next to SpatialAudioBridge rather than in a directory of its own,
    # so its binary core is processed once: twice gives an archive two
    # signature records of the same name, and it fails.
    'CONFIGURATION_BUILD_DIR' => '${PODS_CONFIGURATION_BUILD_DIR}'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
