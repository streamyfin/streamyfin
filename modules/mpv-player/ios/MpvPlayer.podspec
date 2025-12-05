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
  s.dependency 'MPVKit', '~> 0.40.0'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    # Strip debug symbols to avoid DWARF errors from MPVKit
    'DEBUG_INFORMATION_FORMAT' => 'dwarf',
    'STRIP_INSTALLED_PRODUCT' => 'YES',
    'DEPLOYMENT_POSTPROCESSING' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
