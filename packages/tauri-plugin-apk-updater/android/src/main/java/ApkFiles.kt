package io.github.joaogabrielot.apkupdater

import java.io.File
import java.net.URI

object ApkFiles {
    const val ALLOWED_PATH_PREFIX = "/JoaoGabrielOT/nexo-check/releases/download/"

    fun isComplete(actual: Long, expected: Long): Boolean = TODO()

    fun canReuse(file: File, expected: Long): Boolean = TODO()

    fun isAllowedDownloadUrl(url: String): Boolean = TODO()

    fun isAllowedRedirect(url: String): Boolean = TODO()
}
