import ExpoModulesCore

public class NotificationSettingsLinkModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NotificationSettingsLink")

    Events("onOpenSettings")

    Function("takePendingSettingsOpen") { () -> Bool in
      SettingsLinkRelay.shared.takePending()
    }

    OnStartObserving {
      SettingsLinkRelay.shared.listen { [weak self] in
        self?.sendEvent("onOpenSettings", [:])
      }
    }

    OnStopObserving {
      SettingsLinkRelay.shared.listen(nil)
    }
  }
}
