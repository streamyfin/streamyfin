Pod::Spec.new do |s|
  s.name           = 'GlassPoster'
  s.version        = '1.0.0'
  s.summary        = 'Native SwiftUI glass effect poster for tvOS'
  s.description    = 'Provides Liquid Glass effect poster cards for tvOS 26+'
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
