import ExpoModulesCore

public class GlassCardGridModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GlassCardGrid")

    View(GlassCardGridExpoView.self) {
      Events("onItemPress", "onItemLongPress", "onEndReached")

      // One JSON string, for the same reason the row uses one: a typed view
      // prop that fails to convert is swallowed by `try? prop.set(...)` and the
      // view renders empty with no error. See docs/native-card-row.md.
      Prop("payload") { (view: GlassCardGridExpoView, payload: String) in
        view.setPayload(payload)
      }
    }
  }
}
