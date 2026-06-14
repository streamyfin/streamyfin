package expo.modules.tvrecommendations

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.ContentUris
import android.util.Log
import androidx.tvprovider.media.tv.TvContractCompat

class TvRecommendationsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      TvContractCompat.ACTION_INITIALIZE_PROGRAMS -> {
        Log.d("TvRecommendations", "Handling INITIALIZE_PROGRAMS broadcast")
        TvRecommendationsPublisher.refreshFromCache(context)
      }
      "android.media.tv.action.PREVIEW_PROGRAM_BROWSABLE_DISABLED" -> {
        val programId = intent.data?.let { ContentUris.parseId(it) } ?: -1L
        if (programId > 0L) {
          Log.d("TvRecommendations", "Handling PREVIEW_PROGRAM_BROWSABLE_DISABLED for programId=$programId")
          TvRecommendationsPublisher.deletePreviewProgram(context, programId)
        }
      }
    }
  }
}
