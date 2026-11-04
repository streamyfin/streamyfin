package expo.modules.mpvplayer.nativeplayer.engine

/**
 * What the native chrome holds, whatever the engine: transport and queue. A local engine is a
 * [PlayerEngine] and has a screen behind [RenderingEngine]; a remote one has none, so the chrome
 * reaches rendering through `engine as? RenderingEngine` and treats its absence as "none".
 */
interface ChromeEngine : TransportEngine, QueueEngine
