import ExpoModulesCore

public class GlassPosterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GlassPoster")

    // Check if glass effect is available (tvOS 26+)
    Function("isGlassEffectAvailable") { () -> Bool in
      #if os(tvOS)
      if #available(tvOS 26.0, *) {
        return true
      }
      #endif
      return false
    }

    // Native view component
    View(GlassPosterExpoView.self) {
      Prop("imageUrl") { (view: GlassPosterExpoView, url: String?) in
        view.setImageUrl(url)
      }

      Prop("aspectRatio") { (view: GlassPosterExpoView, ratio: Double) in
        view.setAspectRatio(ratio)
      }

      Prop("cornerRadius") { (view: GlassPosterExpoView, radius: Double) in
        view.setCornerRadius(radius)
      }

      Prop("progress") { (view: GlassPosterExpoView, progress: Double) in
        view.setProgress(progress)
      }

      Prop("showWatchedIndicator") { (view: GlassPosterExpoView, show: Bool) in
        view.setShowWatchedIndicator(show)
      }

      Prop("isFocused") { (view: GlassPosterExpoView, focused: Bool) in
        view.setIsFocused(focused)
      }

      Prop("width") { (view: GlassPosterExpoView, width: Double) in
        view.setWidth(width)
      }

      Events("onLoad", "onError")
    }
  }
}
