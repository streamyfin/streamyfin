Pod::Spec.new do |s|
  s.name           = 'MpvPlayer'
  s.version        = '0.40.0'
  s.summary        = 'MPVKit player for iOS/tvOS'
  s.description    = 'A module that integrates MPVKit for video playback in iOS and tvOS applications'
  s.author         = ''
  s.source         = { git: '' }
  s.homepage       = 'https://github.com/mpvkit/MPVKit'
  s.platforms      = { :ios => '13.4', :tvos => '13.4' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MPVKit', '~> 0.40.6'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "*.{h,m,mm,swift,hpp,cpp}"

end