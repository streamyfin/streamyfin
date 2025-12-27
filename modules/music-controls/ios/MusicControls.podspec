Pod::Spec.new do |s|
  s.name           = 'MusicControls'
  s.version        = '1.0.0'
  s.summary        = 'Native now-playing and remote transport controls for music playback'
  s.description    = 'Expo module that exposes MPNowPlayingInfoCenter and MPRemoteCommandCenter to JS for Streamyfin music playback.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.6', :tvos => '15.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end



