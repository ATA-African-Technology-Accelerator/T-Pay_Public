package expo.modules.tpaydownload

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

private const val DIRECTORY = "models"

/**
 * Large downloads (the offline assistant's model) through Android's DownloadManager. It runs
 * in the system, not in the app, so it carries on when the person leaves T-Pay or Android
 * closes it, retries a dropped connection by itself, and shows its progress as a notification.
 * The file lands in the app's own external folder, then moveTo brings it into private storage.
 */
class TpayDownloadModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TpayDownload")

    AsyncFunction("start") { url: String, fileName: String, title: String ->
      val context = context()
      val target = File(context.getExternalFilesDir(DIRECTORY), fileName)
      if (target.exists()) target.delete()
      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(title)
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
        .setDestinationInExternalFilesDir(context, DIRECTORY, fileName)
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(false)
      manager().enqueue(request)
    }

    AsyncFunction("status") { id: Long ->
      manager().query(DownloadManager.Query().setFilterById(id)).use { cursor ->
        if (!cursor.moveToFirst()) {
          return@AsyncFunction mapOf("state" to "missing", "received" to 0.0, "total" to -1.0)
        }
        val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
        val received = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
        val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
        val state = when (status) {
          DownloadManager.STATUS_PENDING -> "pending"
          DownloadManager.STATUS_RUNNING -> "running"
          // Waiting for a network, or for Wi-Fi: DownloadManager carries on by itself.
          DownloadManager.STATUS_PAUSED -> "paused"
          DownloadManager.STATUS_SUCCESSFUL -> "done"
          else -> "failed"
        }
        mapOf("state" to state, "received" to received.toDouble(), "total" to total.toDouble())
      }
    }

    AsyncFunction("cancel") { id: Long ->
      // remove() also deletes the partly downloaded file.
      manager().remove(id)
      Unit
    }

    // Runs off the main thread. A rename is instant on the same disk; otherwise it copies.
    AsyncFunction("moveTo") { id: Long, fileName: String, destination: String ->
      val source = File(context().getExternalFilesDir(DIRECTORY), fileName)
      if (!source.exists()) return@AsyncFunction false
      val target = File(destination)
      target.parentFile?.mkdirs()
      if (target.exists()) target.delete()
      val moved = source.renameTo(target) || run {
        source.copyTo(target, overwrite = true)
        source.delete()
        true
      }
      // Forget the finished download, so it no longer appears in the system's list.
      // Its file has already been moved, so nothing is deleted.
      if (moved) manager().remove(id)
      moved
    }
  }

  private fun context(): Context =
    appContext.reactContext ?: throw IllegalStateException("No React context")

  private fun manager(): DownloadManager =
    context().getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
}
