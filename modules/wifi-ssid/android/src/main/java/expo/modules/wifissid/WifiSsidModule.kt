package expo.modules.wifissid

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WifiSsidModule : Module() {
  companion object {
    private const val TAG = "WifiSsid"
    private const val UNKNOWN_SSID = "<unknown ssid>"
  }

  private val context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("WifiSsid")

    AsyncFunction("getSSID") {
      val (ssid, connectedToWifi) = readWifi()
      mapOf(
        "ssid" to ssid,
        "connectedToWifi" to connectedToWifi,
      )
    }

    Function("getSSIDSync") {
      val (ssid, connectedToWifi) = readWifi()
      mapOf(
        "ssid" to ssid,
        "connectedToWifi" to connectedToWifi,
      )
    }

    Function("openLocationSettings") {
      openLocationSettings()
    }
  }

  /**
   * Returns the current Wi-Fi SSID (or null when it can't be read) and whether
   * the device is connected to a Wi-Fi network. When the device is connected but
   * the SSID is null, the OS is withholding the network name — on Android this
   * typically means device Location services are off (the SSID is treated as
   * location-sensitive).
   */
  private fun readWifi(): Pair<String?, Boolean> {
    val androidContext = context.applicationContext
    var connectedToWifi = false
    var ssid: String? = null

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        val cm = androidContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val caps = cm?.let { manager ->
          manager.activeNetwork?.let { net -> manager.getNetworkCapabilities(net) }
        }
        connectedToWifi = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        if (hasFineLocationPermission()) {
          ssid = (caps?.transportInfo as? WifiInfo)?.ssid?.sanitize()
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error reading Wi-Fi via ConnectivityManager", e)
      }
    } else {
      // Pre-Q (API 26–28): NetworkCapabilities/transportInfo aren't available, so
      // detect a Wi-Fi connection via the legacy active-network API. Without this,
      // connectedToWifi stays false on Android 8/9 even when connected, so the
      // "connected but SSID hidden" state never surfaces there.
      try {
        val cm = androidContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        @Suppress("DEPRECATION")
        connectedToWifi = cm?.activeNetworkInfo?.type == ConnectivityManager.TYPE_WIFI
      } catch (e: Exception) {
        Log.e(TAG, "Error reading Wi-Fi via ConnectivityManager (legacy)", e)
      }
    }

    if (ssid == null && hasFineLocationPermission()) {
      try {
        val wm = androidContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        @Suppress("DEPRECATION")
        ssid = wm?.connectionInfo?.ssid?.sanitize()
      } catch (e: Exception) {
        Log.e(TAG, "Error reading SSID via WifiManager", e)
      }
    }

    return Pair(ssid, connectedToWifi)
  }

  private fun openLocationSettings() {
    try {
      val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.applicationContext.startActivity(intent)
    } catch (e: Exception) {
      Log.e(TAG, "Unable to open Location settings", e)
    }
  }

  private fun hasFineLocationPermission(): Boolean =
    context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED

  private fun String.sanitize(): String? {
    val cleaned = trim('"')
    return if (cleaned.isBlank() || cleaned == UNKNOWN_SSID) null else cleaned
  }
}
