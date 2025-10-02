Pod::Spec.new do |s|
  s.name           = 'BackgroundDownloader'
  s.version        = '1.0.0'
  s.summary        = 'Background file downloader for iOS'
  s.description    = 'Native iOS module for downloading large files in the background using NSURLSession'
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

