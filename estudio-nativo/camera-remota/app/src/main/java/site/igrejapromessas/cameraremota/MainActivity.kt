package site.igrejapromessas.cameraremota

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.pedro.common.ConnectChecker
import com.pedro.library.rtmp.RtmpCamera2
import com.pedro.library.view.OpenGlView

class MainActivity : AppCompatActivity(), ConnectChecker {
    private lateinit var camera: RtmpCamera2
    private lateinit var status: TextView
    private lateinit var ip: EditText
    private val handler = Handler(Looper.getMainLooper())
    private var attempts = 0
    private var wantStream = false
    private var lastUrl: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        status = findViewById(R.id.status)
        ip = findViewById(R.id.ip)
        val preview = findViewById<OpenGlView>(R.id.preview)
        camera = RtmpCamera2(preview, this)
        findViewById<Button>(R.id.start).setOnClickListener { begin() }
        findViewById<Button>(R.id.stop).setOnClickListener { stopAll() }
        findViewById<Button>(R.id.switchCamera).setOnClickListener {
            if (camera.isOnPreview || camera.isStreaming) {
                try {
                    camera.switchCamera()
                } catch (_: Exception) {
                    status.text = "Não troquei a câmera."
                }
            }
        }
    }

    private fun begin() {
        val url = Ingest.rtmpUrl(ip.text.toString())
        if (url == null) {
            status.text = "Informe o IP do notebook, sem senha e sem barra."
            return
        }
        if (!hasPermissions()) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO), 21)
            status.text = "O Android pediu câmera e microfone. Toque em Iniciar de novo depois de permitir."
            return
        }
        wantStream = true
        attempts = 0
        lastUrl = url
        open(url)
    }

    private fun open(url: String) {
        status.text = "Conectando. Ainda não está no ar."
        if (!camera.isOnPreview) camera.startPreview()
        if (camera.isStreaming) camera.stopStream()
        if (camera.prepareAudio() && camera.prepareVideo()) camera.startStream(url)
        else status.text = "Esta câmera não aceitou o preparo de vídeo ou áudio."
    }

    private fun stopAll() {
        wantStream = false
        handler.removeCallbacksAndMessages(null)
        if (camera.isStreaming) camera.stopStream()
        status.text = "Parado. Nada está sendo enviado."
    }

    private fun hasPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }

    override fun onConnectionStarted(url: String) {
        runOnUiThread { status.text = "Conectando ao caminho camera-remota." }
    }

    override fun onConnectionSuccess() {
        attempts = 0
        runOnUiThread { status.text = "Conectado. A imagem está chegando ao notebook." }
    }

    override fun onConnectionFailed(reason: String) {
        runOnUiThread {
            if (!wantStream) return@runOnUiThread
            attempts += 1
            if (attempts > 3) {
                wantStream = false
                status.text = "Não conectou depois de 3 tentativas. Confira o IP, a porta 1935 e o MediaMTX."
                return@runOnUiThread
            }
            val wait = 2000L shl (attempts - 1)
            status.text = "Falhou. Nova tentativa $attempts de 3."
            val url = lastUrl ?: return@runOnUiThread
            handler.postDelayed({ if (wantStream) open(url) }, wait)
        }
    }

    override fun onNewBitrate(bitrate: Long) {}

    override fun onDisconnect() {
        runOnUiThread { if (!wantStream) status.text = "Desconectado." }
    }

    override fun onAuthError() {
        wantStream = false
        runOnUiThread { status.text = "O servidor recusou a publicação. A autenticação não foi alterada." }
    }

    override fun onAuthSuccess() {}
}
