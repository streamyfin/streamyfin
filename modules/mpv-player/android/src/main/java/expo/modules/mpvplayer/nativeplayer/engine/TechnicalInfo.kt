package expo.modules.mpvplayer.nativeplayer.engine

/** The engine's technical info, for the overlay and JS: none from an engine without a screen. */
fun technicalInfoOf(engine: ChromeEngine?): Map<String, Any> =
    (engine as? RenderingEngine)?.getTechnicalInfo() ?: emptyMap()
