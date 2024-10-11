import ExpoModulesCore

public class VlcPlayerModule: Module {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('VlcPlayer')` in JavaScript.
    Name("VlcPlayer")
    View(VlcPlayerView.self) {
      Prop("source") { (view: VlcPlayerView, source: String) in
        view.setSource(source)
      }
    }

    Function("hello") {
      return "hello from native ios"
    }
  }
}
