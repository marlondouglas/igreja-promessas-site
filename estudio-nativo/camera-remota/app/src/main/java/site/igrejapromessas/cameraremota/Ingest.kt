package site.igrejapromessas.cameraremota

object Ingest {
    const val PATH = "camera-remota"
    const val PORT = 1935

    fun rtmpUrl(ip: String): String? {
        val host = ip.trim()
        if (host.isEmpty() || host.contains('@') || host.contains('/') || host.contains(' ')) return null
        return "rtmp://$host:$PORT/$PATH"
    }
}
