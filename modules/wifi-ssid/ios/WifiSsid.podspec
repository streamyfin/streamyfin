Pod::Spec.new do |s|
  s.name           = 'WifiSsid'
  s.version        = '1.0.0'
  s.summary        = 'Get WiFi SSID on iOS'
  s.description    = 'Native iOS module to get current WiFi SSID using NEHotspotNetwork'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.6', :tvos => '15.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'NetworkExtension', 'SystemConfiguration'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
