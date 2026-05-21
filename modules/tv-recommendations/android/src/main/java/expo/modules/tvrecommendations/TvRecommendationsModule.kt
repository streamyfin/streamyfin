package expo.modules.tvrecommendations

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TvRecommendationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TvRecommendations")

    Function("syncRecommendations") { json: String ->
      val context = appContext.reactContext ?: return@Function false
      TvRecommendationsPublisher.sync(context, json)
    }

    Function("clearRecommendations") {
      val context = appContext.reactContext ?: return@Function false
      TvRecommendationsPublisher.clear(context)
    }

    Function("refreshRecommendations") {
      val context = appContext.reactContext ?: return@Function false
      TvRecommendationsPublisher.refreshFromCache(context)
    }
  }
}
