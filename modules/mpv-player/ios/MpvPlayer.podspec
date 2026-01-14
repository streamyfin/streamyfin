Pod::Spec.new do |s|
  s.name           = 'MpvPlayer'
  s.version        = '1.0.0'
  s.summary        = 'MPVKit for Expo'
  s.description    = 'MPVKit for Expo'
  s.author         = 'mpvkit'
  s.homepage       = 'https://github.com/mpvkit/MPVKit'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: 'https://github.com/mpvkit/MPVKit.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MPVKit-GPL'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'VALID_ARCHS' => 'arm64',
    'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386',
    'DEBUG_INFORMATION_FORMAT' => 'dwarf',
    'STRIP_INSTALLED_PRODUCT' => 'YES',
    'DEPLOYMENT_POSTPROCESSING' => 'YES',
  }

  s.user_target_xcconfig = {
    'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386'
  }

  s.source_files = "*.{h,m,mm,swift,hpp,cpp}"
end
