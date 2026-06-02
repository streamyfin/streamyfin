Pod::Spec.new do |s|
  s.name           = 'TopShelfCache'
  s.version        = '1.0.0'
  s.summary        = 'Shared Top Shelf cache writer for Streamyfin tvOS'
  s.description    = 'Writes lightweight Top Shelf cache payloads to an App Group container for the tvOS extension.'
  s.author         = 'Streamyfin'
  s.homepage       = 'https://github.com/streamyfin/streamyfin'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION' => '5.9'
  }

  s.source_files = "*.{h,m,mm,swift}"
end
