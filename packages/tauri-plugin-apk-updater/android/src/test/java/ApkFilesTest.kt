package io.github.joaogabrielot.apkupdater

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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

    @Test
    fun downloadUrlHostAndSchemeAreCaseInsensitive() {
        assertTrue(ApkFiles.isAllowedDownloadUrl(ok.replace("https://github.com", "HTTPS://GitHub.COM")))
        // O caminho continua sensível a maiúsculas.
        assertFalse(ApkFiles.isAllowedDownloadUrl(ok.replace("JoaoGabrielOT", "joaogabrielot")))
    }

    @Test
    fun downloadUrlRejectsEncodedDotSegments() {
        assertFalse(ApkFiles.isAllowedDownloadUrl("https://github.com/JoaoGabrielOT/nexo-check/releases/download/%2e%2e/%2E%2E/x.apk"))
    }

    @Test
    fun assetNameComesFromTheLastUrlSegment() {
        assertEquals("nexo-check-0.1.0.apk", ApkFiles.assetName(ok))
        assertEquals("nexo-check-1.2.3-rc.1.apk", ApkFiles.assetName(ok.replace("nexo-check-0.1.0.apk", "nexo-check-1.2.3-rc.1.apk")))
    }

    @Test
    fun assetNameRejectsOtherNames() {
        assertNull(ApkFiles.assetName(ok.replace("nexo-check-0.1.0.apk", "outro.apk")))
        assertNull(ApkFiles.assetName(ok.replace("nexo-check-0.1.0.apk", "nexo-check-0.1.0.zip")))
        assertNull(ApkFiles.assetName(ok.replace("nexo-check-0.1.0.apk", "nexo-check-.apk")))
        assertNull(ApkFiles.assetName(ok.replace("nexo-check-0.1.0.apk", "nexo-check-0%2F1.apk")))
        assertNull(ApkFiles.assetName(ok.replace("nexo-check-0.1.0.apk", "nexo-check-a_b.apk")))
        assertNull(ApkFiles.assetName("não é url"))
    }

    @Test
    fun staleFilesKeepsOnlyTheCurrentApkAndItsPart() {
        val existing = listOf("nexo-check-0.1.0.apk", "nexo-check-0.1.0.apk.part", "nexo-check-0.0.9.apk", "nexo-check-0.0.9.apk.part", "lixo.bin")
        assertEquals(listOf("nexo-check-0.0.9.apk", "nexo-check-0.0.9.apk.part", "lixo.bin"), ApkFiles.staleFiles(existing, "nexo-check-0.1.0.apk"))
        assertEquals(emptyList<String>(), ApkFiles.staleFiles(emptyList(), "nexo-check-0.1.0.apk"))
    }

    @Test
    fun redirectsAcceptOnlyTheKnownReleaseHosts() {
        assertFalse(ApkFiles.isAllowedRedirect("https://raw.githubusercontent.com/x"))
        assertFalse(ApkFiles.isAllowedRedirect("https://avatars.githubusercontent.com/x"))
        assertFalse(ApkFiles.isAllowedRedirect("https://api.github.com/x"))
        assertTrue(ApkFiles.isAllowedRedirect("https://Objects.GithubUserContent.com/x"))
        assertTrue(ApkFiles.isAllowedRedirect("HTTPS://RELEASE-ASSETS.GITHUBUSERCONTENT.COM/x"))
    }
}
