Pod::Spec.new do |s|
  s.name           = 'SfPlayer'
  s.module_name    = 'SfPlayer'
  s.version        = '1.0.0'
  s.summary        = 'Streamyfin Player - KSPlayer wrapper for Expo'
  s.description    = 'Video player with GPU acceleration and PiP support for Expo, powered by KSPlayer'
  s.author         = 'streamyfin'
  s.homepage       = 'https://github.com/streamyfin/streamyfin'
  s.license        = { :type => 'MPL-2.0' }
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: 'https://github.com/streamyfin/streamyfin.git' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.dependency 'KSPlayer'
  s.dependency 'DisplayCriteria'
  
  # KSPlayer pods are injected into the Podfile via plugins/withKSPlayer.js

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'DEBUG_INFORMATION_FORMAT' => 'dwarf',
    'STRIP_INSTALLED_PRODUCT' => 'YES',
    'DEPLOYMENT_POSTPROCESSING' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
