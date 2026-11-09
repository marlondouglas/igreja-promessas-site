package site.igrejapromessas.cameraremota

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IngestTest {
    @Test fun rejectsEmptyAndFinalPaths() {
        assertNull(Ingest.rtmpUrl(""))
        assertNull(Ingest.rtmpUrl(" "))
        assertNull(Ingest.rtmpUrl("10.0.0.8/culto-aac"))
        assertEquals("rtmp://127.0.0.1:1935/camera-remota", Ingest.rtmpUrl("127.0.0.1"))
        assertEquals(false, Ingest.rtmpUrl("127.0.0.1")!!.contains("culto"))
    }
}
