Pod::Spec.new do |s|
  s.name           = 'NotificationSettingsLink'
  s.version        = '1.0.0'
  s.summary        = 'Opens the app on its notification settings from the iOS Settings'
  s.description    = 'Relays userNotificationCenter(_:openSettingsFor:) to JavaScript, including a tap that launched the app.'
  s.author         = ''
  s.homepage       = 'https://github.com/streamyfin/streamyfin'
  # iOS only, from the version ExpoNotifications needs; tvOS has no notification settings.
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoNotifications'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
