Pod::Spec.new do |s|
  s.name           = 'VlcPlayer3'
  s.version        = '3.6.1b1'
  s.summary        = 'A sample project summary'
  s.description    = 'A sample project description'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '13.4', :tvos => '13.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.ios.dependency 'MobileVLCKit', s.version
  s.tvos.dependency 'TVVLCKit', s.version

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "*.{h,m,mm,swift,hpp,cpp}"
end
