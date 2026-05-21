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
    val channelId = prefs.getLong(KEY_CHANNEL_ID, -1L)
    val programIds = prefs.getString(KEY_PROGRAM_IDS, null)?.let(::JSONObject)
    val contentResolver = context.contentResolver

    if (programIds != null) {
      var deletedPrograms = 0
      val keys = programIds.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        val programId = programIds.optLong(key, -1L)
        if (programId > 0L) {
          contentResolver.delete(
            TvContractCompat.buildPreviewProgramUri(programId),
            null,
            null
          )
          deletedPrograms += 1
        }
      }
      Log.d(TAG, "clear(): deleted $deletedPrograms preview program(s)")
    }

    if (channelId > 0L) {
      contentResolver.notifyChange(TvContractCompat.buildChannelUri(channelId), null)
      Log.d(TAG, "clear(): notified channel $channelId")
    }

    prefs.edit()
      .remove(KEY_PAYLOAD)
      .remove(KEY_PROGRAM_IDS)
      .apply()

    return true
  }

  private fun synchronize(context: Context, payload: JSONObject): Boolean {
    val sections = payload.optJSONArray("sections") ?: JSONArray()
    val firstSection = if (sections.length() > 0) sections.optJSONObject(0) else null
    val sectionTitle = firstSection?.optString("title")?.takeIf { it.isNotBlank() } ?: DEFAULT_CHANNEL_NAME
    val items = firstSection?.optJSONArray("items") ?: JSONArray()

    Log.d(
      TAG,
      "synchronize(): using section \"$sectionTitle\" with ${items.length()} item(s)"
    )

    val channelId = getOrCreateChannel(context, sectionTitle)
    if (channelId <= 0L) {
      Log.w(TAG, "synchronize(): failed to get or create preview channel")
      return false
    }

    Log.d(TAG, "synchronize(): publishing into channelId=$channelId")

    val previousProgramIds = preferences(context)
      .getString(KEY_PROGRAM_IDS, null)
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
        context.contentResolver.delete(
          TvContractCompat.buildPreviewProgramUri(programId),
          null,
          null
        )
        deletedPrograms += 1
        Log.d(TAG, "synchronize(): deleted stale programId=$programId for item=$providerId")
      }
    }

    preferences(context)
      .edit()
      .putLong(KEY_CHANNEL_ID, channelId)
      .putString(KEY_PROGRAM_IDS, nextProgramIds.toString())
      .apply()

    logProviderState(context, channelId)

    Log.d(
      TAG,
      "synchronize(): completed with ${activeProviderIds.size} active program(s), deleted $deletedPrograms stale program(s)"
    )

    return true
  }

  private fun getOrCreateChannel(context: Context, displayName: String): Long {
    val prefs = preferences(context)
    val existingChannelId = prefs.getLong(KEY_CHANNEL_ID, -1L)
    val contentResolver = context.contentResolver

    if (existingChannelId > 0L) {
      val updated = Channel.Builder()
        .setType(TvContractCompat.Channels.TYPE_PREVIEW)
        .setDisplayName(displayName)
        .setAppLinkIntentUri(buildIntentUri(context, "streamyfin://"))
        .build()

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

      Log.w(TAG, "getOrCreateChannel(): stored channelId=$existingChannelId was stale, recreating")
      prefs.edit().remove(KEY_CHANNEL_ID).apply()
    }

    val channel = Channel.Builder()
      .setType(TvContractCompat.Channels.TYPE_PREVIEW)
      .setDisplayName(displayName)
      .setAppLinkIntentUri(buildIntentUri(context, "streamyfin://"))
      .build()

    val channelUri = contentResolver.insert(
      TvContractCompat.Channels.CONTENT_URI,
      channel.toContentValues()
    ) ?: return -1L

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

    item.optString("subtitle").takeIf { it.isNotBlank() }?.let {
      builder.setDescription(it)
    }

    imageUrl.takeIf { it.isNotBlank() }?.let {
      val imageUri = Uri.parse(it)
      builder.setPosterArtUri(imageUri)
      builder.setThumbnailUri(imageUri)
    }


    val contentValues = builder.build().toContentValues()
    val contentResolver = context.contentResolver

    if (previousProgramId > 0L) {
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
    }

    val insertedUri = contentResolver.insert(
      TvContractCompat.PreviewPrograms.CONTENT_URI,
      contentValues
    ) ?: return -1L

    val programId = ContentUris.parseId(insertedUri)
    Log.d(TAG, "upsertPreviewProgram(): inserted new programId=$programId")
    return programId
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
    val outputStream = context.contentResolver.openOutputStream(
      TvContractCompat.buildChannelLogoUri(channelId)
    ) ?: return

    outputStream.use { stream ->
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
      stream.flush()
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
    } catch (error: Exception) {
      Log.w(TAG, "logProviderState(): failed to query channelId=$channelId", error)
    }
  }
}
