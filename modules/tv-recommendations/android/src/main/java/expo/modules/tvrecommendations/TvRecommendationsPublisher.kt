package expo.modules.tvrecommendations

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.util.Log
import androidx.tvprovider.media.tv.Channel
import androidx.tvprovider.media.tv.PreviewProgram
import androidx.tvprovider.media.tv.TvContractCompat
import org.json.JSONArray
import org.json.JSONObject

internal object TvRecommendationsPublisher {
  private const val TAG = "TvRecommendations"
  private const val PREFS_NAME = "StreamyfinTvRecommendations"
  private const val KEY_PAYLOAD = "payload"
  private const val KEY_CHANNEL_ID = "channelId"
  private const val KEY_PROGRAM_IDS = "programIds"
  private const val DEFAULT_CHANNEL_NAME = "Continue and Next Up"

  fun sync(context: Context, payloadJson: String): Boolean {
    val payload = try {
      JSONObject(payloadJson)
    } catch (error: Exception) {
      Log.e(TAG, "Failed to parse recommendations payload", error)
      return false
    }

    val sectionCount = payload.optJSONArray("sections")?.length() ?: 0
    Log.d(TAG, "sync(): received payload with $sectionCount section(s)")

    preferences(context)
      .edit()
      .putString(KEY_PAYLOAD, payloadJson)
      .apply()

    return synchronize(context, payload)
  }

  fun refreshFromCache(context: Context): Boolean {
    val payloadJson = preferences(context).getString(KEY_PAYLOAD, null) ?: return false
    val payload = try {
      JSONObject(payloadJson)
    } catch (error: Exception) {
      Log.e(TAG, "Failed to parse cached recommendations payload", error)
      return false
    }

    val sectionCount = payload.optJSONArray("sections")?.length() ?: 0
    Log.d(TAG, "refreshFromCache(): replaying cached payload with $sectionCount section(s)")

    return synchronize(context, payload)
  }

  fun clear(context: Context): Boolean {
    val prefs = preferences(context)
    val contentResolver = context.contentResolver

    // KEY_PROGRAM_IDS is now { channelId: "{ providerId: programId }" }
    val allProgramIds = prefs.getString(KEY_PROGRAM_IDS, null)?.let(::JSONObject)
    if (allProgramIds != null) {
      var deletedPrograms = 0
      val channelKeys = allProgramIds.keys()
      while (channelKeys.hasNext()) {
        val channelIdStr = channelKeys.next()
        val programIdsJson = allProgramIds.optString(channelIdStr)
        if (programIdsJson.isBlank()) continue

        try {
          val programIds = JSONObject(programIdsJson)
          val keys = programIds.keys()
          while (keys.hasNext()) {
            val providerId = keys.next()
            val programId = programIds.optLong(providerId, -1L)
            if (programId > 0L) {
              deletePreviewProgram(contentResolver, programId)
              deletedPrograms += 1
            }
          }
        } catch (e: Exception) {
          Log.w(TAG, "clear(): failed to parse programIds for channel $channelIdStr", e)
        }

        // Notify the channel
        val channelId = channelIdStr.toLongOrNull() ?: -1L
        if (channelId > 0L) {
          try {
            contentResolver.notifyChange(TvContractCompat.buildChannelUri(channelId), null)
          } catch (e: SecurityException) {
            Log.w(TAG, "clear(): lost provider permission, cannot notify channel $channelId", e)
          }
        }

        // Remove per-channel pref
        prefs.edit().remove("programIds_$channelIdStr").apply()
      }
      Log.d(TAG, "clear(): deleted $deletedPrograms preview program(s)")
    }

    // Also handle legacy format (flat { providerId: programId }) for migration
    val legacyProgramIds = prefs.getString("legacy_" + KEY_PROGRAM_IDS, null)?.let(::JSONObject)
    if (legacyProgramIds != null) {
      val keys = legacyProgramIds.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        val programId = legacyProgramIds.optLong(key, -1L)
        if (programId > 0L) {
          deletePreviewProgram(contentResolver, programId)
        }
      }
      prefs.edit().remove("legacy_" + KEY_PROGRAM_IDS).apply()
    }

    prefs.edit()
      .remove(KEY_PAYLOAD)
      .remove(KEY_PROGRAM_IDS)
      .apply()

    return true
  }

  /**
   * Delete a single preview program from the TvProvider.
   * Called by clear(), synchronize() (stale programs), and TvRecommendationsReceiver (user removed).
   */
  fun deletePreviewProgram(context: Context, programId: Long) {
    try {
      context.contentResolver.delete(
        TvContractCompat.buildPreviewProgramUri(programId),
        null,
        null
      )
      Log.d(TAG, "deletePreviewProgram(): deleted programId=$programId")

      // Also remove from stored programIds prefs
      removeProgramFromPrefs(context, programId)
    } catch (e: SecurityException) {
      Log.w(TAG, "deletePreviewProgram(): lost provider permission for programId=$programId", e)
    }
  }

  private fun deletePreviewProgram(contentResolver: android.content.ContentResolver, programId: Long) {
    try {
      contentResolver.delete(
        TvContractCompat.buildPreviewProgramUri(programId),
        null,
        null
      )
    } catch (e: SecurityException) {
      Log.w(TAG, "deletePreviewProgram(): lost provider permission for programId=$programId", e)
    }
  }

  private fun removeProgramFromPrefs(context: Context, programId: Long) {
    val prefs = preferences(context)
    val programIdsJson = prefs.getString(KEY_PROGRAM_IDS, null) ?: return
    try {
      val programIds = JSONObject(programIdsJson)
      val keys = programIds.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        if (programIds.optLong(key, -1L) == programId) {
          programIds.remove(key)
          break
        }
      }
      prefs.edit().putString(KEY_PROGRAM_IDS, programIds.toString()).apply()
    } catch (e: Exception) {
      Log.w(TAG, "removeProgramFromPrefs(): failed to update prefs for programId=$programId", e)
    }
  }

  private fun synchronize(context: Context, payload: JSONObject): Boolean {
    val sections = payload.optJSONArray("sections") ?: JSONArray()
    if (sections.length() == 0) {
      Log.w(TAG, "synchronize(): no sections in payload")
      return false
    }

    val prefs = preferences(context)
    val allNextProgramIds = JSONObject()
    var totalActive = 0
    var totalDeleted = 0

    for (sectionIndex in 0 until sections.length()) {
      val section = sections.optJSONObject(sectionIndex) ?: continue
      val sectionTitle = section.optString("title")?.takeIf { it.isNotBlank() } ?: DEFAULT_CHANNEL_NAME
      val items = section.optJSONArray("items") ?: JSONArray()

      Log.d(
        TAG,
        "synchronize(): section \"$sectionTitle\" ($sectionIndex/${sections.length()}) with ${items.length()} item(s)"
      )

      val channelId = getOrCreateChannel(context, sectionTitle)
      if (channelId <= 0L) {
        Log.w(TAG, "synchronize(): failed to get or create channel for \"$sectionTitle\"")
        continue
      }

      // Per Android docs: check channel.isBrowsable() and request if needed.
      if (!isChannelBrowsable(context, channelId)) {
        Log.d(TAG, "synchronize(): channel $channelId not browsable, requesting browsable")
        TvContractCompat.requestChannelBrowsable(context, channelId)
      }

      val prefKey = "programIds_$channelId"
      val previousProgramIds = prefs.getString(prefKey, null)
        ?.let(::JSONObject)
        ?: JSONObject()
      val nextProgramIds = JSONObject()
      val activeProviderIds = mutableSetOf<String>()

      for (index in 0 until items.length()) {
        val item = items.optJSONObject(index) ?: continue
        val providerId = item.optString("id")
        if (providerId.isBlank()) continue

        val programId = upsertPreviewProgram(
          context = context,
          channelId = channelId,
          item = item,
          previousProgramId = previousProgramIds.optLong(providerId, -1L),
          weight = index
        )

        if (programId > 0L) {
          activeProviderIds += providerId
          nextProgramIds.put(providerId, programId)
          Log.d(TAG, "synchronize(): upserted program for item=$providerId programId=$programId")
        }
      }

      var deletedPrograms = 0
      val previousKeys = previousProgramIds.keys()
      while (previousKeys.hasNext()) {
        val providerId = previousKeys.next()
        if (activeProviderIds.contains(providerId)) continue

        val programId = previousProgramIds.optLong(providerId, -1L)
        if (programId > 0L) {
          deletePreviewProgram(context, programId)
          deletedPrograms += 1
          Log.d(TAG, "synchronize(): deleted stale programId=$programId for item=$providerId")
        }
      }

      allNextProgramIds.put(channelId.toString(), nextProgramIds.toString())
      prefs.edit().putString(prefKey, nextProgramIds.toString()).apply()
      totalActive += activeProviderIds.size
      totalDeleted += deletedPrograms

      logProviderState(context, channelId)
    }

    // Store all channel program IDs for clear() to use
    prefs.edit().putString(KEY_PROGRAM_IDS, allNextProgramIds.toString()).apply()

    Log.d(
      TAG,
      "synchronize(): completed across ${sections.length()} section(s), $totalActive active program(s), deleted $totalDeleted stale program(s)"
    )

    return true
  }

  /**
   * Query provider to check if a channel is browsable.
   * Per Android docs: "check channel.isBrowsable() before updating programs."
   */
  private fun isChannelBrowsable(context: Context, channelId: Long): Boolean {
    return try {
      context.contentResolver.query(
        TvContractCompat.buildChannelUri(channelId),
        null,
        null,
        null,
        null
      )?.use { cursor ->
        if (cursor.moveToFirst()) {
          val browsableIndex = cursor.getColumnIndex(TvContractCompat.Channels.COLUMN_BROWSABLE)
          if (browsableIndex >= 0) cursor.getInt(browsableIndex) == 1 else true
        } else {
          false
        }
      } ?: false
    } catch (e: SecurityException) {
      Log.w(TAG, "isChannelBrowsable(): lost provider permission for channelId=$channelId", e)
      true // Assume browsable if we can't check, to avoid blocking updates
    }
  }

  /**
   * Query provider to verify a channel actually exists.
   * Prevents the channel-delete-recreate bug: if update() returns 0 rows
   * we must first check whether the channel was deleted by the system
   * or if the update simply failed for another reason.
   */
  private fun channelExistsInProvider(context: Context, channelId: Long): Boolean {
    return try {
      context.contentResolver.query(
        TvContractCompat.buildChannelUri(channelId),
        null,
        null,
        null,
        null
      )?.use { cursor ->
        cursor.moveToFirst()
      } ?: false
    } catch (e: SecurityException) {
      Log.w(TAG, "channelExistsInProvider(): lost provider permission for channelId=$channelId", e)
      false
    }
  }

  private fun getOrCreateChannel(context: Context, displayName: String): Long {
    val prefs = preferences(context)
    val existingChannelId = prefs.getLong(KEY_CHANNEL_ID, -1L)
    val contentResolver = context.contentResolver

    if (existingChannelId > 0L) {
      // Query provider first to verify channel actually exists (prevents recreate bug)
      val exists = channelExistsInProvider(context, existingChannelId)

      if (exists) {
        // Channel exists — update it in place, never recreate
        val updated = Channel.Builder()
          .setType(TvContractCompat.Channels.TYPE_PREVIEW)
          .setDisplayName(displayName)
          .setAppLinkIntentUri(buildIntentUri(context, "streamyfin://"))
          .build()

        try {
          val updatedRows = contentResolver.update(
            TvContractCompat.buildChannelUri(existingChannelId),
            updated.toContentValues(),
            null,
            null
          )

          if (updatedRows > 0) {
            TvContractCompat.requestChannelBrowsable(context, existingChannelId)
            storeChannelLogo(context, existingChannelId)
            Log.d(TAG, "getOrCreateChannel(): updated existing channelId=$existingChannelId and requested browsable")
            return existingChannelId
          }

          // Update returned 0 rows but channel exists — log and return existing ID, don't recreate
          Log.e(TAG, "getOrCreateChannel(): update returned 0 for existing channelId=$existingChannelId but channel exists — not recreating")
          return existingChannelId
        } catch (e: SecurityException) {
          Log.w(TAG, "getOrCreateChannel(): lost provider permission updating channelId=$existingChannelId", e)
          return existingChannelId
        }
      }

      // Channel truly doesn't exist in provider — recreate
      Log.w(TAG, "getOrCreateChannel(): channelId=$existingChannelId not in provider, recreating")
      prefs.edit().remove(KEY_CHANNEL_ID).apply()
    }

    // Create a new channel
    val channel = Channel.Builder()
      .setType(TvContractCompat.Channels.TYPE_PREVIEW)
      .setDisplayName(displayName)
      .setAppLinkIntentUri(buildIntentUri(context, "streamyfin://"))
      .build()

    val channelUri = try {
      contentResolver.insert(
        TvContractCompat.Channels.CONTENT_URI,
        channel.toContentValues()
      )
    } catch (e: SecurityException) {
      Log.e(TAG, "getOrCreateChannel(): lost provider permission, cannot create channel", e)
      null
    } ?: return -1L

    val channelId = ContentUris.parseId(channelUri)
    TvContractCompat.requestChannelBrowsable(context, channelId)
    storeChannelLogo(context, channelId)
    Log.d(TAG, "getOrCreateChannel(): created new channelId=$channelId displayName=\"$displayName\"")

    return channelId
  }

  private fun upsertPreviewProgram(
    context: Context,
    channelId: Long,
    item: JSONObject,
    previousProgramId: Long,
    weight: Int
  ): Long {
    val providerId = item.optString("id")
    val imageUrl = item.optString("imageUrl")

    val builder = PreviewProgram.Builder()
      .setChannelId(channelId)
      .setType(programTypeFor(item.optString("itemType")))
      .setTitle(item.optString("title"))
      .setInternalProviderId(providerId)
      .setContentId(providerId)
      .setIntentUri(buildIntentUri(context, item.optString("playRoute").ifBlank { item.optString("route") }))
      .setWeight(weight)
      .setPosterArtAspectRatio(TvContractCompat.PreviewPrograms.ASPECT_RATIO_16_9)

    item.optString("subtitle").takeIf { it.isNotBlank() }?.let {
      builder.setDescription(it)
    }

    // Per Android docs: use unique URIs for all images to avoid stale cache
    imageUrl.takeIf { it.isNotBlank() }?.let {
      val uniqueImageUrl = appendCacheBuster(it)
      val imageUri = Uri.parse(uniqueImageUrl)
      builder.setPosterArtUri(imageUri)
      builder.setThumbnailUri(imageUri)
    }

    val contentValues = builder.build().toContentValues()
    val contentResolver = context.contentResolver

    if (previousProgramId > 0L) {
      try {
        val updatedRows = contentResolver.update(
          TvContractCompat.buildPreviewProgramUri(previousProgramId),
          contentValues,
          null,
          null
        )

        if (updatedRows > 0) {
          Log.d(TAG, "upsertPreviewProgram(): updated existing programId=$previousProgramId")
          return previousProgramId
        }

        Log.w(TAG, "upsertPreviewProgram(): existing programId=$previousProgramId was stale, inserting new row")
      } catch (e: SecurityException) {
        Log.w(TAG, "upsertPreviewProgram(): lost provider permission for programId=$previousProgramId", e)
      }
    }

    val insertedUri = try {
      contentResolver.insert(
        TvContractCompat.PreviewPrograms.CONTENT_URI,
        contentValues
      )
    } catch (e: SecurityException) {
      Log.w(TAG, "upsertPreviewProgram(): lost provider permission, cannot insert program", e)
      null
    } ?: return -1L

    val programId = ContentUris.parseId(insertedUri)
    Log.d(TAG, "upsertPreviewProgram(): inserted new programId=$programId")
    return programId
  }

  /**
   * Append a cache-busting parameter to ensure unique URIs when images change.
   * Per Android docs: "Use unique Uris for all images... the old image will
   * continue to appear if you don't change the Uri."
   */
  private fun appendCacheBuster(imageUrl: String): String {
    val separator = if (imageUrl.contains("?")) "&" else "?"
    return "$imageUrl${separator}_t=${System.currentTimeMillis()}"
  }

  private fun buildIntentUri(context: Context, deepLink: String): Uri {
    val intent = Intent(Intent.ACTION_VIEW).apply {
      data = Uri.parse(deepLink)
      `package` = context.packageName
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

    return Uri.parse(intent.toUri(Intent.URI_INTENT_SCHEME))
  }

  private fun programTypeFor(itemType: String): Int {
    return when (itemType) {
      "Movie" -> TvContractCompat.PreviewPrograms.TYPE_MOVIE
      "Episode" -> TvContractCompat.PreviewPrograms.TYPE_TV_EPISODE
      "Series" -> TvContractCompat.PreviewPrograms.TYPE_TV_SERIES
      else -> TvContractCompat.PreviewPrograms.TYPE_CLIP
    }
  }

  private fun storeChannelLogo(context: Context, channelId: Long) {
    val bitmap = applicationIconBitmap(context) ?: return
    try {
      val outputStream = context.contentResolver.openOutputStream(
        TvContractCompat.buildChannelLogoUri(channelId)
      ) ?: return

      outputStream.use { stream ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
        stream.flush()
      }
    } catch (e: SecurityException) {
      Log.w(TAG, "storeChannelLogo(): lost provider permission for channelId=$channelId", e)
    }
  }

  private fun applicationIconBitmap(context: Context): Bitmap? {
    val drawable = try {
      context.packageManager.getApplicationIcon(context.packageName)
    } catch (error: PackageManager.NameNotFoundException) {
      Log.w(TAG, "Unable to load application icon", error)
      return null
    }

    return drawable.toBitmap()
  }

  private fun Drawable.toBitmap(): Bitmap {
    if (this is BitmapDrawable && bitmap != null) {
      return bitmap
    }

    val width = intrinsicWidth.takeIf { it > 0 } ?: 256
    val height = intrinsicHeight.takeIf { it > 0 } ?: 256
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    setBounds(0, 0, canvas.width, canvas.height)
    draw(canvas)
    return bitmap
  }

  fun getChannelId(context: Context): Long {
    return preferences(context).getLong(KEY_CHANNEL_ID, -1L)
  }

  private fun preferences(context: Context): SharedPreferences {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }

  private fun logProviderState(context: Context, channelId: Long) {
    val contentResolver = context.contentResolver

    try {
      contentResolver.query(
        TvContractCompat.buildChannelUri(channelId),
        null,
        null,
        null,
        null
      )?.use { cursor ->
        if (cursor.moveToFirst()) {
          val browsableIndex = cursor.getColumnIndex(TvContractCompat.Channels.COLUMN_BROWSABLE)
          val packageNameIndex = cursor.getColumnIndex(TvContractCompat.Channels.COLUMN_PACKAGE_NAME)
          val displayNameIndex = cursor.getColumnIndex(TvContractCompat.Channels.COLUMN_DISPLAY_NAME)

          val browsable = if (browsableIndex >= 0) cursor.getInt(browsableIndex) else -1
          val packageName = if (packageNameIndex >= 0) cursor.getString(packageNameIndex) else "unknown"
          val displayName = if (displayNameIndex >= 0) cursor.getString(displayNameIndex) else "unknown"

          Log.d(
            TAG,
            "logProviderState(): channelId=$channelId exists=true browsable=$browsable packageName=$packageName displayName=$displayName"
          )
        } else {
          Log.w(TAG, "logProviderState(): channelId=$channelId exists=false")
        }
      } ?: Log.w(TAG, "logProviderState(): channel query returned null for channelId=$channelId")
    } catch (error: SecurityException) {
      Log.w(TAG, "logProviderState(): lost provider permission for channelId=$channelId", error)
    }
  }
}
