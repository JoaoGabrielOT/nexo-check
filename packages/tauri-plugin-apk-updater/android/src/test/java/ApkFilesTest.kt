package io.github.joaogabrielot.apkupdater

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApkFilesTest {
    private val ok = "https://github.com/JoaoGabrielOT/nexo-check/releases/download/v0.1.0/nexo-check-0.1.0.apk"

    @Test
    fun isCompleteRequiresExactSize() {
        assertTrue(ApkFiles.isComplete(100, 100))
        assertFalse(ApkFiles.isComplete(99, 100))
        assertFalse(ApkFiles.isComplete(101, 100))
    }

    @Test
    fun isCompleteRequiresPositiveExpectedSize() {
        assertFalse(ApkFiles.isComplete(0, 0))
        assertFalse(ApkFiles.isComplete(-1, -1))
    }

    @Test
    fun canReuseOnlyWhenSizeMatches() {
        val file = File.createTempFile("apk", ".apk")
        try {
            file.writeBytes(ByteArray(100))
            assertTrue(ApkFiles.canReuse(file, 100))
            assertFalse(ApkFiles.canReuse(file, 101))
        } finally {
            file.delete()
        }
    }

    @Test
    fun canReuseIsFalseForMissingFile() {
        assertFalse(ApkFiles.canReuse(File("nao-existe-${System.nanoTime()}.apk"), 100))
    }

    @Test
    fun downloadUrlMustBeAReleaseOfTheRepository() {
        assertTrue(ApkFiles.isAllowedDownloadUrl(ok))
        assertFalse(ApkFiles.isAllowedDownloadUrl(ok.replace("https:", "http:")))
        assertFalse(ApkFiles.isAllowedDownloadUrl(ok.replace("JoaoGabrielOT", "outro")))
        assertFalse(ApkFiles.isAllowedDownloadUrl("https://github.com/JoaoGabrielOT/nexo-check/releases/latest"))
        assertFalse(ApkFiles.isAllowedDownloadUrl("https://evil.example/JoaoGabrielOT/nexo-check/releases/download/a.apk"))
        assertFalse(ApkFiles.isAllowedDownloadUrl("https://github.com@evil.example/JoaoGabrielOT/nexo-check/releases/download/a.apk"))
        assertFalse(ApkFiles.isAllowedDownloadUrl("https://github.com:444/JoaoGabrielOT/nexo-check/releases/download/a.apk"))
        assertFalse(ApkFiles.isAllowedDownloadUrl("https://github.com/JoaoGabrielOT/nexo-check/releases/download/../../x.apk"))
        assertFalse(ApkFiles.isAllowedDownloadUrl("não é url"))
    }

    @Test
    fun redirectsMustStayOnHttpsGithubHosts() {
        assertTrue(ApkFiles.isAllowedRedirect("https://objects.githubusercontent.com/github-production-release-asset/abc"))
        assertTrue(ApkFiles.isAllowedRedirect("https://release-assets.githubusercontent.com/x"))
        assertTrue(ApkFiles.isAllowedRedirect("https://github.com/JoaoGabrielOT/nexo-check/releases/download/v1/a.apk"))
        assertFalse(ApkFiles.isAllowedRedirect("http://objects.githubusercontent.com/x"))
        assertFalse(ApkFiles.isAllowedRedirect("https://githubusercontent.com.evil.example/x"))
        assertFalse(ApkFiles.isAllowedRedirect("https://evilgithubusercontent.com/x"))
        assertFalse(ApkFiles.isAllowedRedirect("https://user@objects.githubusercontent.com/x"))
    }
}
