package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.nativeplayer.engine.ChromeEngine

/**
 * A remote engine lent to a screen. The engine lives with the connection to the TV, not with the screen:
 * the screen hands it back by [release] and never calls stop() itself, so closing it sends nothing to the TV.
 */
class RemoteEngineLease(val engine: ChromeEngine, val release: () -> Unit)
