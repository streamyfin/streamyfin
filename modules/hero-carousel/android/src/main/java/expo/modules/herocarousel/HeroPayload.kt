package expo.modules.herocarousel

import org.json.JSONArray
import org.json.JSONObject

/**
 * Plain values the Compose layer renders, decoded from the `payload` prop.
 * Mirrors `HeroCarouselExpoView.swift` on iOS — both sides parse the same
 * JSON the JS view builds, so neither platform needs its own JS path.
 */
data class HeroItem(
  val id: String,
  val title: String,
  val subtitle: String?,
  val overview: String,
  val label: String?,
  /** SF Symbol name; resolved to a Material icon in `HeroCarouselContent`. */
  val labelIcon: String?,
  val backdropUrl: String?,
  val logoUrl: String?,
  val posterUrl: String?,
  val badges: List<String>,
  val communityRating: Double?,
  /** Watch progress in 0..1; renders a progress bar when > 0. */
  val progress: Float?
)

/** One row of the filter menu. Labels arrive pre-localized. */
data class HeroFilterOption(
  val key: String,
  val label: String,
  val enabled: Boolean,
  /** Red one-way action rather than a checkmark toggle. */
  val destructive: Boolean
)

/** A group of filter rows. An absent title renders as a plain divider. */
data class HeroFilterSection(
  val key: String,
  val title: String?,
  val options: List<HeroFilterOption>
)

/** Wire format of the `payload` prop. */
data class HeroPayload(
  val items: List<HeroItem> = emptyList(),
  val imageHeaders: Map<String, String> = emptyMap(),
  val filterSections: List<HeroFilterSection> = emptyList(),
  val filterLabel: String = ""
) {
  companion object {
    val EMPTY = HeroPayload()

    /** Returns null when the payload can't be read, so the view keeps what it has. */
    fun parse(json: String): HeroPayload? {
      return try {
        val root = JSONObject(json)
        HeroPayload(
          items = root.optJSONArray("items").mapObjects { it.toHeroItem() }.filterNotNull(),
          imageHeaders = root.optJSONObject("imageHeaders").toStringMap(),
          filterSections = root.optJSONArray("filterSections")
            .mapObjects { it.toFilterSection() }
            .filterNotNull(),
          filterLabel = root.stringOrNull("filterLabel").orEmpty()
        )
      } catch (_: Exception) {
        null
      }
    }
  }
}

private fun JSONObject.toHeroItem(): HeroItem? {
  val id = stringOrNull("id") ?: return null
  return HeroItem(
    id = id,
    title = stringOrNull("title").orEmpty(),
    subtitle = stringOrNull("subtitle"),
    overview = stringOrNull("overview").orEmpty(),
    label = stringOrNull("label"),
    labelIcon = stringOrNull("labelIcon"),
    backdropUrl = stringOrNull("backdropUrl"),
    logoUrl = stringOrNull("logoUrl"),
    posterUrl = stringOrNull("posterUrl"),
    badges = optJSONArray("badges").mapStrings(),
    communityRating = doubleOrNull("communityRating"),
    progress = doubleOrNull("progress")?.toFloat()?.coerceIn(0f, 1f)
  )
}

private fun JSONObject.toFilterSection(): HeroFilterSection? {
  val key = stringOrNull("key") ?: return null
  return HeroFilterSection(
    key = key,
    title = stringOrNull("title"),
    options = optJSONArray("options").mapObjects { it.toFilterOption() }.filterNotNull()
  )
}

private fun JSONObject.toFilterOption(): HeroFilterOption? {
  val key = stringOrNull("key") ?: return null
  return HeroFilterOption(
    key = key,
    label = stringOrNull("label").orEmpty(),
    enabled = optBoolean("enabled", false),
    destructive = optBoolean("destructive", false)
  )
}

/**
 * `optString` resolves an explicit JSON null to the literal string "null", so
 * every read goes through `isNull` first — the payload leans on nullable
 * fields (`subtitle`, `logoUrl`, ...) and a "null" title would render as one.
 */
private fun JSONObject.stringOrNull(key: String): String? =
  if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }

private fun JSONObject.doubleOrNull(key: String): Double? =
  if (isNull(key)) null else optDouble(key).takeIf { !it.isNaN() }

private fun <T> JSONArray?.mapObjects(transform: (JSONObject) -> T?): List<T?> {
  val array = this ?: return emptyList()
  return (0 until array.length()).mapNotNull { index ->
    array.optJSONObject(index)?.let(transform)
  }
}

private fun JSONArray?.mapStrings(): List<String> {
  val array = this ?: return emptyList()
  return (0 until array.length()).mapNotNull { index ->
    if (array.isNull(index)) null else array.optString(index).takeIf { it.isNotEmpty() }
  }
}

private fun JSONObject?.toStringMap(): Map<String, String> {
  val json = this ?: return emptyMap()
  val result = mutableMapOf<String, String>()
  val keys = json.keys()
  while (keys.hasNext()) {
    val key = keys.next()
    if (json.isNull(key)) continue
    result[key] = json.optString(key)
  }
  return result
}
