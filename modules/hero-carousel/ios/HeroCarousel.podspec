Pod::Spec.new do |s|
  s.name           = 'HeroCarousel'
  s.version        = '1.0.0'
  s.summary        = 'Native SwiftUI hero carousel for iOS'
  s.description    = 'Paged hero carousel with parallax backdrops and glass info panels for the home tab'
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
