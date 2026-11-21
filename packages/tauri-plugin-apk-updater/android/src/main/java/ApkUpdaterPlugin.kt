package io.github.joaogabrielot.apkupdater

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
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

// O código vai para o JS como está; a mensagem da exceção fica só no log.
private class UpdateException(val code: String) : Exception(code)

private const val TAG = "ApkUpdater"
private const val TIMEOUT_MS = 30_000
private const val DEADLINE_MS = 10 * 60 * 1000L

@TauriPlugin
class ApkUpdaterPlugin(private val launchActivity: Activity) : Plugin(launchActivity) {
    private val running = AtomicBoolean(false)
    private var webView: WebView? = null

    override fun load(webView: WebView) {
        super.load(webView)
        this.webView = webView
    }

    // A Activity pode ser recriada: usa a do WebView atual e só cai na do lançamento se faltar.
    private fun currentActivity(): Activity {
        var ctx: Context? = webView?.context
        while (ctx is ContextWrapper) {
            if (ctx is Activity) return ctx
            ctx = ctx.baseContext
        }
        return launchActivity
    }

    @Command
    fun downloadAndInstall(invoke: Invoke) {
        val args = invoke.parseArgs(DownloadArgs::class.java)
        if (!ApkFiles.isAllowedDownloadUrl(args.url)) {
            invoke.reject("url_not_allowed")
            return
        }
        val name = ApkFiles.assetName(args.url)
        if (name == null) {
            invoke.reject("invalid_asset")
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
                val dir = File(launchActivity.cacheDir, "updates")
                dir.mkdirs()
                // Só o APK desta release (e o .part dele) fica no cache.
                ApkFiles.staleFiles(dir.list()?.toList() ?: emptyList(), name).forEach { File(dir, it).delete() }
                val file = File(dir, name)
                if (!ApkFiles.canReuse(file, args.expectedSize)) {
                    download(args.url, file, args.expectedSize)
                }
                // O resultado sai da thread da UI, junto com a decisão de abrir o instalador.
                currentActivity().runOnUiThread { finish(invoke, file) }
            } catch (e: UpdateException) {
                invoke.reject(e.code)
            } catch (e: Exception) {
                Log.w(TAG, "download falhou", e)
                invoke.reject("download_failed")
            } finally {
                running.set(false)
            }
        }
    }

    private fun finish(invoke: Invoke, file: File) {
        try {
            val activity = currentActivity()
            val result = JSObject()
            if (!isForeground(activity)) {
                // No Android 10+ o startActivity em segundo plano é bloqueado sem aviso:
                // o APK fica pronto e a UI oferece "Instalar agora".
                result.put("status", "ready")
            } else if (!activity.packageManager.canRequestPackageInstalls()) {
                activity.startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${activity.packageName}"),
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
                result.put("status", "needs_permission")
            } else {
                openInstaller(activity, file)
                result.put("status", "installing")
            }
            invoke.resolve(result)
        } catch (e: Exception) {
            Log.w(TAG, "abrir o instalador falhou", e)
            invoke.reject("install_failed")
        }
    }

    private fun isForeground(activity: Activity): Boolean {
        if (activity.isFinishing || activity.isDestroyed) return false
        val owner = activity as? LifecycleOwner ?: return false
        return owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
    }

    private fun download(url: String, target: File, expected: Long) {
        val part = File(target.parentFile, target.name + ".part")
        target.delete()
        val deadline = SystemClock.elapsedRealtime() + DEADLINE_MS
        val conn = open(url, deadline)
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
                        if (now > deadline) throw UpdateException("download_timeout")
                        if (now - lastEmit >= 250) {
                            lastEmit = now
                            emit(downloaded, expected)
                        }
                    }
                }
            }
            if (!ApkFiles.isComplete(downloaded, expected)) throw UpdateException("size_mismatch")
            emit(downloaded, expected)
            if (!part.renameTo(target)) throw UpdateException("download_failed")
        } catch (e: Exception) {
            part.delete()
            throw e
        } finally {
            conn.disconnect()
        }
    }

    // Segue os redirecionamentos à mão (GitHub manda o download para outro host) e só
    // aceita https nos hosts conhecidos de release.
    private fun open(start: String, deadline: Long): HttpURLConnection {
        var current = start
        var hops = 0
        while (true) {
            if (SystemClock.elapsedRealtime() > deadline) throw UpdateException("download_timeout")
            val conn = URL(current).openConnection() as HttpURLConnection
            conn.connectTimeout = TIMEOUT_MS
            conn.readTimeout = TIMEOUT_MS
            conn.instanceFollowRedirects = false
            val code = conn.responseCode
            if (code in 300..399 && code != 304) {
                val location = conn.getHeaderField("Location")
                conn.disconnect()
                if (location == null) throw UpdateException("redirect_blocked")
                val next = URL(URL(current), location).toString()
                if (++hops > 5 || !ApkFiles.isAllowedRedirect(next)) throw UpdateException("redirect_blocked")
                current = next
                continue
            }
            if (code != HttpURLConnection.HTTP_OK) {
                conn.disconnect()
                Log.w(TAG, "HTTP $code")
                throw UpdateException("http_error")
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

    private fun openInstaller(activity: Activity, file: File) {
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.apkupdater.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
    }
}
