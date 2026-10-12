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
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
