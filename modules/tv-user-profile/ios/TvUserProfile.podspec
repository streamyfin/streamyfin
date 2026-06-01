Pod::Spec.new do |s|
  s.name           = 'TvUserProfile'
  s.version        = '1.0.0'
  s.summary        = 'tvOS User Profile Management for Expo'
  s.description    = 'Native tvOS module to get current user profile and listen for profile changes using TVUserManager'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.6', :tvos => '15.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # TVServices framework is only available on tvOS
  s.tvos.frameworks = 'TVServices'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
