package expo.modules.herocarousel

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HeroCarouselModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HeroCarousel")

    View(HeroCarouselExpoView::class) {
      Events("onItemPress", "onFilterToggle")

      // Everything the view renders arrives as one JSON string: the slides,
      // the image auth headers and the filter menu. The string prop exists
      // for iOS's sake (typed props are applied there with `try? prop.set`,
      // which swallows a failed conversion), and it is the reason this view
      // could be added under the same name with no JS changes at all.
      Prop("payload") { view: HeroCarouselExpoView, payload: String ->
        view.setPayload(payload)
      }
    }
  }
}
