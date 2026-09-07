// A9VideoView — a React Native native view that renders the H.264 stream
// coming from an A9CameraModule session. The view holds a SurfaceView and
// feeds NAL units into a MediaCodec configured for hardware H.264 decoding.
//
// JS pushes NAL units via the "nal" prop (base64 string). Each new value
// (single access-unit or start-code-prefixed chunk) is fed to the decoder.
package com.emergent.securevaultsync.gbpwid.a9

import android.content.Context
import android.media.MediaCodec
import android.media.MediaFormat
import android.util.Base64
import android.util.Log
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import java.nio.ByteBuffer
import java.util.concurrent.ArrayBlockingQueue

class A9VideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {
    private val TAG = "A9VideoView"
    private var codec: MediaCodec? = null
    private var codecThread: Thread? = null
    private val nalQueue = ArrayBlockingQueue<ByteArray>(64)
    private var running = false

    init {
        holder.addCallback(this)
    }

    override fun surfaceCreated(holder: SurfaceHolder) { startCodec(holder.surface) }
    override fun surfaceChanged(h: SurfaceHolder, f: Int, w: Int, height: Int) {}
    override fun surfaceDestroyed(holder: SurfaceHolder) { stopCodec() }

    private fun startCodec(surface: Surface) {
        try {
            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, 640, 480)
            val c = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            c.configure(format, surface, null, 0)
            c.start()
            codec = c
            running = true
            codecThread = Thread { pumpLoop() }.apply { start() }
        } catch (e: Exception) {
            Log.e(TAG, "codec init failed: ${e.message}")
        }
    }

    private fun stopCodec() {
        running = false
        try { codec?.stop() } catch (_: Exception) {}
        try { codec?.release() } catch (_: Exception) {}
        codec = null
        codecThread?.interrupt()
        codecThread = null
        nalQueue.clear()
    }

    fun feedBase64(b64: String) {
        try {
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            // Best-effort: prepend 4-byte NAL start code so the decoder
            // finds unit boundaries. Some cameras already include it.
            val payload = if (hasStartCode(bytes)) bytes else byteArrayOf(0, 0, 0, 1) + bytes
            if (!nalQueue.offer(payload)) {
                nalQueue.poll(); nalQueue.offer(payload)
            }
        } catch (e: Exception) { Log.w(TAG, "feed error: ${e.message}") }
    }

    private fun hasStartCode(b: ByteArray): Boolean =
        b.size >= 4 && b[0] == 0.toByte() && b[1] == 0.toByte() &&
        (b[2] == 0.toByte() || b[2] == 1.toByte())

    private fun pumpLoop() {
        val info = MediaCodec.BufferInfo()
        val c = codec ?: return
        while (running) {
            val nal = try { nalQueue.take() } catch (_: InterruptedException) { break }
            try {
                val inIdx = c.dequeueInputBuffer(20_000)
                if (inIdx >= 0) {
                    val ib: ByteBuffer = c.getInputBuffer(inIdx) ?: continue
                    ib.clear(); ib.put(nal)
                    c.queueInputBuffer(inIdx, 0, nal.size, System.nanoTime() / 1000, 0)
                }
                var outIdx = c.dequeueOutputBuffer(info, 0)
                while (outIdx >= 0) {
                    c.releaseOutputBuffer(outIdx, true)
                    outIdx = c.dequeueOutputBuffer(info, 0)
                }
            } catch (e: Exception) {
                Log.w(TAG, "pump error: ${e.message}"); break
            }
        }
    }
}
