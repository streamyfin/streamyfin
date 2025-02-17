Pod::Spec.new do |s|
  s.name           = 'HlsDownloader'
  s.version        = '0.0.1'
  s.summary        = 'Download HLS streams with AVAssetDownloadURLSession'
  s.description    = 'Download HLS streams with AVAssetDownloadURLSession'
  s.author         = 'Streamyfin'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '13.4', :tvos => '13.4' }
  s.source         = { git: 'https://github.com/streamyfin/streamyfin' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'XMLCoder'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
