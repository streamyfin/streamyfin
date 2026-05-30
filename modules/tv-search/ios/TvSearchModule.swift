import ExpoModulesCore

public class TvSearchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TvSearchModule")

    View(TvSearchView.self) {
      Events("onChangeText")

      Prop("placeholder") { (view: TvSearchView, value: String?) in
        view.setPlaceholder(value ?? "")
      }
    }
  }
}
