package io.github.joaogabrielot.apkupdater

import java.io.File
import java.net.URI
import java.util.Locale

object ApkFiles {
    const val ALLOWED_PATH_PREFIX = "/JoaoGabrielOT/nexo-check/releases/download/"

    // Raw string: em string comum o Kotlin recusa "\-" e "\." (escape inválido).
    private val ASSET_NAME = Regex("""^nexo-check-[0-9A-Za-z.\-]+\.apk$""")

    // Hosts para onde o GitHub redireciona o download de assets de release.
    private val REDIRECT_HOSTS = setOf(
        "github.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
    )

    // O tamanho esperado vem da release e precisa ser positivo; nada de "0 == 0".
    fun isComplete(actual: Long, expected: Long): Boolean = expected > 0 && actual == expected

    fun canReuse(file: File, expected: Long): Boolean = file.isFile && isComplete(file.length(), expected)

    /** Só `https://github.com/JoaoGabrielOT/nexo-check/releases/download/...`. */
    fun isAllowedDownloadUrl(url: String): Boolean {
        val uri = parse(url) ?: return false
        val path = uri.path ?: return false
        return uri.scheme?.lowercase(Locale.ROOT) == "https" &&
            uri.host?.lowercase(Locale.ROOT) == "github.com" &&
            uri.port == -1 &&
            uri.userInfo == null &&
            path.startsWith(ALLOWED_PATH_PREFIX) &&
            !path.split('/').contains("..")
    }

    /** Nome local do APK: último segmento da URL, só se for `nexo-check-<versão>.apk`. */
    fun assetName(url: String): String? {
        val name = parse(url)?.path?.substringAfterLast('/') ?: return null
        return if (ASSET_NAME.matches(name)) name else null
    }

    /** Nomes em `cache/updates` a apagar: tudo que não for o APK atual nem o `.part` dele. */
    fun staleFiles(existing: List<String>, keep: String): List<String> =
        existing.filter { it != keep && it != "$keep.part" }

    /** O GitHub redireciona o download para outro host dele; qualquer outro destino é recusado. */
    fun isAllowedRedirect(url: String): Boolean {
        val uri = parse(url) ?: return false
        return uri.scheme?.lowercase(Locale.ROOT) == "https" &&
            uri.userInfo == null &&
            uri.host?.lowercase(Locale.ROOT) in REDIRECT_HOSTS
    }

    private fun parse(url: String): URI? = try {
        URI(url)
    } catch (_: Exception) {
        null
    }
}
