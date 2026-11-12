package expo.modules.tpayradio

import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.location.LocationManager
import androidx.core.location.LocationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val REQUEST_ENABLE_BLUETOOTH = 7301

/**
 * The radio checks Nearby Connections needs and does not provide itself: whether Bluetooth
 * is on, the system request to turn it on, and whether location services are on, which
 * Nearby needs on Android 11 and older.
 */
class TpayRadioModule : Module() {
  private var pendingEnable: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("TpayRadio")

    // "on", "off" or "unsupported" when the phone has no Bluetooth.
    AsyncFunction("bluetoothState") {
      val adapter = adapter() ?: return@AsyncFunction "unsupported"
      if (adapter.isEnabled) "on" else "off"
    }

    // Shows the system dialog. Resolves true when the person turned Bluetooth on.
    // Needs BLUETOOTH_CONNECT on Android 12 and newer, so ask for permissions first.
    AsyncFunction("requestBluetoothOn") { promise: Promise ->
      val adapter = adapter()
      val activity = appContext.currentActivity
      when {
        adapter == null || activity == null -> promise.resolve(false)
        adapter.isEnabled -> promise.resolve(true)
        else -> {
          pendingEnable?.resolve(false)
          pendingEnable = promise
          try {
            activity.startActivityForResult(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQUEST_ENABLE_BLUETOOTH)
          } catch (e: SecurityException) {
            pendingEnable = null
            promise.resolve(false)
          }
        }
      }
    }

    AsyncFunction("locationServicesOn") {
      val manager = context()?.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        ?: return@AsyncFunction false
      LocationManagerCompat.isLocationEnabled(manager)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_ENABLE_BLUETOOTH) return@OnActivityResult
      val promise = pendingEnable ?: return@OnActivityResult
      pendingEnable = null
      promise.resolve(payload.resultCode == Activity.RESULT_OK || adapter()?.isEnabled == true)
    }
  }

  private fun context(): Context? = appContext.reactContext

  private fun adapter(): BluetoothAdapter? =
    (context()?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
}
