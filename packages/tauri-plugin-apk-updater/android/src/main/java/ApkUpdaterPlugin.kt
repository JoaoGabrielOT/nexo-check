package io.github.joaogabrielot.apkupdater

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

@InvokeArg
class DownloadArgs {
    lateinit var url: String
    var expectedSize: Long = 0
}

private class UpdateException(val code: String) : Exception(code)

@TauriPlugin
class ApkUpdaterPlugin(private val activity: Activity) : Plugin(activity) {
    private val running = AtomicBoolean(false)

    @Command
    fun downloadAndInstall(invoke: Invoke) {
        val args = invoke.parseArgs(DownloadArgs::class.java)
        if (!ApkFiles.isAllowedDownloadUrl(args.url)) {
            invoke.reject("url_not_allowed")
            return
        }
        if (args.expectedSize <= 0) {
            invoke.reject("invalid_size")
            return
        }
        if (!running.compareAndSet(false, true)) {
            invoke.reject("already_running")
            return
        }
        thread(name = "apk-updater") {
            try {
                val dir = File(activity.cacheDir, "updates")
                dir.mkdirs()
                val file = File(dir, "nexo-check-update.apk")
                if (!ApkFiles.canReuse(file, args.expectedSize)) {
                    download(args.url, file, args.expectedSize)
                }
                val result = JSObject()
                if (!activity.packageManager.canRequestPackageInstalls()) {
                    openUnknownSourcesSettings()
                    result.put("status", "needs_permission")
                } else {
                    openInstaller(file)
                    result.put("status", "installing")
                }
                invoke.resolve(result)
            } catch (e: UpdateException) {
                invoke.reject(e.code)
            } catch (e: Exception) {
                invoke.reject("download_failed: ${e.message}")
            } finally {
                running.set(false)
            }
        }
    }

    private fun download(url: String, target: File, expected: Long) {
        val part = File(target.parentFile, target.name + ".part")
        target.delete()
        val conn = open(url)
        try {
            val declared = conn.contentLengthLong
            if (declared > 0 && declared != expected) throw UpdateException("size_mismatch")
            var downloaded = 0L
            var lastEmit = 0L
            conn.inputStream.use { input ->
                FileOutputStream(part).use { out ->
                    val buf = ByteArray(32 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        downloaded += n
                        // Nunca grava além do tamanho esperado (disco e arquivo errado).
                        if (downloaded > expected) throw UpdateException("size_mismatch")
                        out.write(buf, 0, n)
                        val now = SystemClock.elapsedRealtime()
                        if (now - lastEmit >= 250) {
                            lastEmit = now
                            emit(downloaded, expected)
                        }
                    }
                }
            }
            if (!ApkFiles.isComplete(downloaded, expected)) throw UpdateException("size_mismatch")
            emit(downloaded, expected)
            if (!part.renameTo(target)) throw UpdateException("rename_failed")
        } catch (e: Exception) {
            part.delete()
            throw e
        } finally {
            conn.disconnect()
        }
    }

    // Segue os redirecionamentos à mão (GitHub manda o download para outro host) e só
    // aceita https em hosts do GitHub.
    private fun open(start: String): HttpURLConnection {
        var current = start
        var hops = 0
        while (true) {
            val conn = URL(current).openConnection() as HttpURLConnection
            conn.connectTimeout = 30_000
            conn.readTimeout = 30_000
            conn.instanceFollowRedirects = false
            val code = conn.responseCode
            if (code in 300..399 && code != 304) {
                val location = conn.getHeaderField("Location")
                conn.disconnect()
                if (location == null) throw UpdateException("bad_redirect")
                val next = URL(URL(current), location).toString()
                if (++hops > 5 || !ApkFiles.isAllowedRedirect(next)) throw UpdateException("bad_redirect")
                current = next
                continue
            }
            if (code != HttpURLConnection.HTTP_OK) {
                conn.disconnect()
                throw UpdateException("http_$code")
            }
            return conn
        }
    }

    private fun emit(downloaded: Long, total: Long) {
        val data = JSObject()
        data.put("downloaded", downloaded)
        data.put("total", total)
        trigger("progress", data)
    }

    private fun openUnknownSourcesSettings() {
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${activity.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.runOnUiThread { activity.startActivity(intent) }
    }

    private fun openInstaller(file: File) {
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.apkupdater.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.runOnUiThread { activity.startActivity(intent) }
    }
}
