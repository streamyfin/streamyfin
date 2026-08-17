import ExpoModulesCore

public class GlassCardRowModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GlassCardRow")

    View(GlassCardRowExpoView.self) {
      Events("onItemPress", "onItemLongPress", "onEndReached")

      // Everything the row renders arrives as one JSON string: the cards, the
      // image auth headers and the card geometry. Typed Record/Array props are
      // applied natively with `try? prop.set(...)` (ExpoFabricView.updateProps),
      // so a conversion that fails is swallowed silently and the view just
      // renders empty with no error anywhere. A String prop has no such failure
      // mode, and the payload stays portable for a future Android view.
      Prop("payload") { (view: GlassCardRowExpoView, payload: String) in
        view.setPayload(payload)
      }
    }
  }
}
