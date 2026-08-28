Pod::Spec.new do |s|
  s.name           = 'SystemVolume'
  s.version        = '1.0.0'
  s.summary        = 'Read and observe the system output volume'
  s.description    = 'Read-only KVO observation of AVAudioSession.outputVolume, iOS and tvOS.'
  s.author         = ''
  s.homepage       = 'https://github.com/streamyfin/streamyfin'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AVFoundation'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
