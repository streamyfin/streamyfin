Pod::Spec.new do |s|
  s.name             = 'MpvPlayer'
  s.version          = '1.0.0'
  s.summary          = 'MPV-based video player for Streamyfin (Expo module)'
  s.author           = 'Streamyfin'
  s.homepage         = 'https://github.com/streamyfin/streamyfin'
  s.platforms        = { :ios => '15.1', :tvos => '15.1' }
  s.source           = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MPVKit'
  # Google Cast SDK for the module's Cast support (ios/Cast), phones and tablets only: tvOS
  # compiles a stub. The variant without Bluetooth stopped at 4.8.0 (2023, no arm64
  # simulator), so this is the same pod the app linked through the library.
  s.ios.dependency 'google-cast-sdk', '~> 4.8'

  # Tier 1 builds only (e2e/README.md, "Fake Cast receivers"): `STREAMYFIN_FAKE_CAST_DEVICES=1 pod install`
  # compiles fake receivers in place of the Cast SDK's. No store build sets it.
  fake_cast_devices = ENV['STREAMYFIN_FAKE_CAST_DEVICES'] == '1'
  # A store build refuses them, whatever lingers in its environment: EAS names the profile it builds.
  eas_build_profile = ENV['EAS_BUILD_PROFILE'].to_s
  if fake_cast_devices && eas_build_profile.start_with?('production')
    raise "STREAMYFIN_FAKE_CAST_DEVICES is set for the store profile '#{eas_build_profile}': fake Cast receivers never ship"
  end

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => fake_cast_devices ? '$(inherited) FAKE_CAST_DEVICES' : '$(inherited)'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
