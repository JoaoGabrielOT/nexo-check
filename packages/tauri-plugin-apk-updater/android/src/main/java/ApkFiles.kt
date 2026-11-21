package io.github.joaogabrielot.apkupdater

import java.io.File
import java.net.URI

object ApkFiles {
    const val ALLOWED_PATH_PREFIX = "/JoaoGabrielOT/nexo-check/releases/download/"

    // O tamanho esperado vem da release e precisa ser positivo; nada de "0 == 0".
    fun isComplete(actual: Long, expected: Long): Boolean = expected > 0 && actual == expected

    fun canReuse(file: File, expected: Long): Boolean = file.isFile && isComplete(file.length(), expected)

    /** Só `https://github.com/JoaoGabrielOT/nexo-check/releases/download/...`. */
    fun isAllowedDownloadUrl(url: String): Boolean {
        val uri = parse(url) ?: return false
        val path = uri.path ?: return false
        return uri.scheme == "https" &&
            uri.host == "github.com" &&
            uri.port == -1 &&
            uri.userInfo == null &&
            path.startsWith(ALLOWED_PATH_PREFIX) &&
            !path.split('/').contains("..")
    }

    /** O GitHub redireciona o download para outro host dele; qualquer outro destino é recusado. */
    fun isAllowedRedirect(url: String): Boolean {
        val uri = parse(url) ?: return false
        val host = uri.host ?: return false
        return uri.scheme == "https" &&
            uri.userInfo == null &&
            (host == "github.com" || host.endsWith(".githubusercontent.com"))
    }

    private fun parse(url: String): URI? = try {
        URI(url)
    } catch (_: Exception) {
        null
    }
}
