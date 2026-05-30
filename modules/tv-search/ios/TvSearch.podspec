Pod::Spec.new do |s|
  s.name           = 'TvSearch'
  s.version        = '1.0.0'
  s.summary        = 'Native tvOS search field with text change events'
  s.description    = 'Hosts SwiftUI .searchable inside a UIHostingController so React Native can render its own results grid while using the native tvOS search bar and grid keyboard.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
