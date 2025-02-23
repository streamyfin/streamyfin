Pod::Spec.new do |s|
  s.name           = 'VlcPlayer'
  s.version        = '4.0.0a10'
  s.summary        = 'A sample project summary'
  s.description    = 'A sample project description'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '13.4', :tvos => '16' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.ios.dependency 'VLCKit', s.version
  s.tvos.dependency 'VLCKit', s.version
  s.dependency 'Alamofire', '~> 5.10'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
