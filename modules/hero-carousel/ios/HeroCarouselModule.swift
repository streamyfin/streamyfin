import ExpoModulesCore

public class HeroCarouselModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HeroCarousel")

    View(HeroCarouselExpoView.self) {
      Events("onItemPress", "onFilterToggle")

      // Everything the view renders arrives as one JSON string: the slides
      // and the image auth headers. Typed Record/Dictionary props proved
      // unreliable here — expo-modules-core applies view props with
      // `try? prop.set(...)` (ExpoFabricView.updateProps), so a conversion
      // that fails is swallowed silently and the view just renders empty
      // with no error anywhere. A String prop has no such failure mode, and
      // the payload stays portable for a future Android implementation.
      Prop("payload") { (view: HeroCarouselExpoView, payload: String) in
        view.setPayload(payload)
      }
    }
  }
}
