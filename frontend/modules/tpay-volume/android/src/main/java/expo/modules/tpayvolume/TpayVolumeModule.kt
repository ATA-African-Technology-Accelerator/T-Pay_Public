package expo.modules.tpayvolume

import android.os.SystemClock
import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val DOUBLE_PRESS_MS = 600L

/**
 * Pressing Volume Up twice quickly asks the app to listen. The first press still changes the
 * volume as normal; only the second is taken, so people can always turn the volume up. MainActivity
 * hands every key press to [VolumeKeys.handle], which stays out of the way until the app turns it on.
 */
object VolumeKeys {
  @Volatile var onDoublePress: (() -> Unit)? = null
  private var lastUp = 0L

  /** True when the key press was the second tap and has been used, so Android should not also use it. */
  fun handle(keyCode: Int, repeatCount: Int): Boolean {
    val callback = onDoublePress ?: return false
    if (keyCode != KeyEvent.KEYCODE_VOLUME_UP || repeatCount != 0) return false
    val now = SystemClock.uptimeMillis()
    if (now - lastUp <= DOUBLE_PRESS_MS) {
      lastUp = 0L
      callback()
      return true
    }
    lastUp = now
    return false
  }
}

class TpayVolumeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TpayVolume")
    Events("onDoubleVolumeUp")

    // Switched on only while the person is signed in and unlocked.
    Function("setEnabled") { enabled: Boolean ->
      VolumeKeys.onDoublePress = if (enabled) { { sendEvent("onDoubleVolumeUp", mapOf<String, Any?>()) } } else null
    }

    OnDestroy { VolumeKeys.onDoublePress = null }
  }
}
