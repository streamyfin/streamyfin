package expo.modules.herocarousel

/**
 * The font scale the cards draw at: the system's, held at the payload's cap
 * when it has one. JS sends a cap for phone-sized windows only.
 */
internal fun cardFontScale(systemScale: Float, maxFontScale: Float?): Float =
  if (maxFontScale == null) systemScale else systemScale.coerceAtMost(maxFontScale)
