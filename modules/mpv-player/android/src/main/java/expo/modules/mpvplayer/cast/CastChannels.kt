package expo.modules.mpvplayer.cast

/** The namespaces whose receiver callback is registered on the current Cast session. */
internal class CastChannels {
    private val namespaces = mutableSetOf<String>()

    /**
     * Runs [register] once per namespace. The namespace counts as registered only once [register]
     * returns: the SDK refuses a callback without a live connection, and a namespace marked before
     * that would make every later call skip the registration for the rest of the session.
     */
    fun register(namespace: String, register: () -> Unit) {
        if (namespace in namespaces) return
        register()
        namespaces.add(namespace)
    }

    fun remove(namespace: String): Boolean = namespaces.remove(namespace)

    fun forEach(action: (String) -> Unit) = namespaces.forEach(action)

    fun clear() = namespaces.clear()
}
