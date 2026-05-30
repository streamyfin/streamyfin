package expo.modules.tvrecommendations

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.tvprovider.media.tv.TvContractCompat

class TvRecommendationsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TvContractCompat.ACTION_INITIALIZE_PROGRAMS) {
      return
    }

    Log.d("TvRecommendations", "Handling INITIALIZE_PROGRAMS broadcast")
    TvRecommendationsPublisher.refreshFromCache(context)
  }
}
