// A9CameraModule — React Native native module exposing:
//   discover(timeoutMs)      → resolves with list of {uid, ip, port}
//   connect(ip, port)        → opens UDP session, resolves with session id
//   startVideo(sessionId)    → asks camera to start streaming
//   stop(sessionId)          → closes session
//   isSupported()            → true on Android
//
// Emits events via DeviceEventManager:
//   "A9Camera:discovered" → {uid, ip, port}
//   "A9Camera:frame"      → {sessionId, base64Nal}
//   "A9Camera:disconnected" → {sessionId, reason}
//
// NOTE: This is a LOCAL-network-only implementation of the CS2 "PPPP"
// protocol used by A9-family cameras. It cannot punch through NAT and it
// cannot be tested in Expo Go or the web preview — a native build on a
// real Android device connected to the same Wi-Fi as the camera is
// required. The protocol is proprietary and unstable; some cameras will
// not respond even on the LAN.
package com.emergent.securevaultsync.gbpwid.a9

import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import kotlin.coroutines.coroutineContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class A9CameraModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    private val TAG = "A9Camera"
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val sessionCounter = AtomicInteger(0)
    private val sessions = ConcurrentHashMap<Int, Session>()

    override fun getName() = "A9Camera"

    private data class Session(
        val id: Int,
        val socket: DatagramSocket,
        val addr: InetSocketAddress,
        val job: Job,
        val keepAliveJob: Job,
        val nalBuffer: MutableList<ByteArray> = mutableListOf(),
        var lastSeq: Int = -1,
    )

    // ------------------------------------------------------------- utils

    private fun emit(event: String, params: WritableMap) {
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }

    private fun broadcastAddress(): InetAddress {
        // Naive: 255.255.255.255. Some routers block subnet broadcast; caller
        // can also target a specific /24 broadcast if it knows the subnet.
        return InetAddress.getByName("255.255.255.255")
    }

    // ------------------------------------------------------------- RN API

    @ReactMethod
    fun isSupported(promise: Promise) {
        promise.resolve(true)
    }

    /**
     * Broadcast a LAN discovery packet on the common A9 ports and collect
     * every HELLO_ACK response until [timeoutMs] elapses.
     */
    @ReactMethod
    fun discover(timeoutMs: Int, promise: Promise) {
        scope.launch {
            val found = ConcurrentHashMap<String, WritableMap>()
            val sockets = mutableListOf<DatagramSocket>()
            try {
                for (port in PPPPProtocol.DISCOVERY_PORTS) {
                    val sock = DatagramSocket(null).apply {
                        reuseAddress = true
                        broadcast = true
                        soTimeout = 500
                    }
                    try {
                        sock.bind(InetSocketAddress(0))
                    } catch (e: Exception) {
                        Log.w(TAG, "bind failed for port=$port ephemeral: ${e.message}")
                        continue
                    }
                    sockets.add(sock)

                    // Send both search variants to maximize compatibility.
                    for (packet in listOf(PPPPProtocol.lanSearch(), PPPPProtocol.lanSearchExt())) {
                        try {
                            sock.send(DatagramPacket(packet, packet.size, broadcastAddress(), port))
                        } catch (e: Exception) {
                            Log.w(TAG, "broadcast failed on $port: ${e.message}")
                        }
                    }

                    launch(Dispatchers.IO) {
                        val buf = ByteArray(2048)
                        val deadline = System.currentTimeMillis() + timeoutMs
                        while (System.currentTimeMillis() < deadline && isActive) {
                            try {
                                val dp = DatagramPacket(buf, buf.size)
                                sock.receive(dp)
                                val header = PPPPProtocol.parseHeader(dp.data) ?: continue
                                if (header.type != PPPPProtocol.MSG_HELLO_ACK &&
                                    header.type != PPPPProtocol.MSG_HELLO) continue
                                val payload = dp.data.copyOfRange(4, 4 + header.length.coerceAtMost(dp.length - 4))
                                val uid = PPPPProtocol.extractUid(payload) ?: "camera-${dp.address.hostAddress}"
                                val key = "${dp.address.hostAddress}:${dp.port}"
                                if (!found.containsKey(key)) {
                                    val m = Arguments.createMap().apply {
                                        putString("uid", uid)
                                        putString("ip", dp.address.hostAddress)
                                        putInt("port", dp.port)
                                    }
                                    found[key] = m
                                    emit("A9Camera:discovered", Arguments.createMap().apply {
                                        putString("uid", uid)
                                        putString("ip", dp.address.hostAddress)
                                        putInt("port", dp.port)
                                    })
                                }
                            } catch (_: java.net.SocketTimeoutException) { /* poll */ }
                            catch (e: Exception) { Log.w(TAG, "recv error: ${e.message}"); break }
                        }
                    }
                }

                delay(timeoutMs.toLong())
                val list = Arguments.createArray()
                found.values.forEach { list.pushMap(it) }
                promise.resolve(list)
            } catch (e: Exception) {
                promise.reject("A9_DISCOVER_ERROR", e.message, e)
            } finally {
                sockets.forEach { runCatching { it.close() } }
            }
        }
    }

    /** Open a UDP session to the given camera and complete the PPPP handshake. */
    @ReactMethod
    fun connect(ip: String, port: Int, promise: Promise) {
        scope.launch {
            try {
                val sock = DatagramSocket(null).apply {
                    reuseAddress = true
                    soTimeout = 2000
                    bind(InetSocketAddress(0))
                }
                val addr = InetSocketAddress(InetAddress.getByName(ip), port)
                sock.send(DatagramPacket(PPPPProtocol.hello(), PPPPProtocol.hello().size, addr))

                val buf = ByteArray(2048)
                val dp = DatagramPacket(buf, buf.size)
                val start = System.currentTimeMillis()
                var acked = false
                while (System.currentTimeMillis() - start < 3000) {
                    try {
                        sock.receive(dp)
                        val h = PPPPProtocol.parseHeader(dp.data) ?: continue
                        if (h.type == PPPPProtocol.MSG_HELLO_ACK ||
                            h.type == PPPPProtocol.MSG_P2P_RDY) { acked = true; break }
                    } catch (_: java.net.SocketTimeoutException) {
                        sock.send(DatagramPacket(PPPPProtocol.hello(), PPPPProtocol.hello().size, addr))
                    }
                }
                if (!acked) {
                    sock.close()
                    promise.reject("A9_CONNECT_TIMEOUT", "Camera at $ip:$port did not respond")
                    return@launch
                }

                val id = sessionCounter.incrementAndGet()
                val readerJob = launch { readLoop(id, sock, addr) }
                val kaJob = launch { keepAlive(sock, addr) }
                sessions[id] = Session(id, sock, addr, readerJob, kaJob)
                promise.resolve(id)
            } catch (e: Exception) {
                promise.reject("A9_CONNECT_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun startVideo(sessionId: Int, promise: Promise) {
        val s = sessions[sessionId]
        if (s == null) { promise.reject("A9_NO_SESSION", "unknown session $sessionId"); return }
        scope.launch {
            try {
                for (seq in 0 until 3) {
                    val p = PPPPProtocol.startVideoStream(seq)
                    s.socket.send(DatagramPacket(p, p.size, s.addr))
                    delay(80)
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("A9_STARTVIDEO_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun stop(sessionId: Int, promise: Promise) {
        val s = sessions.remove(sessionId)
        if (s == null) { promise.resolve(false); return }
        try {
            s.socket.send(DatagramPacket(PPPPProtocol.close(), PPPPProtocol.close().size, s.addr))
        } catch (_: Exception) {}
        s.keepAliveJob.cancel()
        s.job.cancel()
        runCatching { s.socket.close() }
        promise.resolve(true)
    }

    // Required for the DeviceEventEmitter to be registered on RN 0.65+
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // ------------------------------------------------------------- internals

    private suspend fun keepAlive(sock: DatagramSocket, addr: InetSocketAddress) {
        while (coroutineContext.isActive && !sock.isClosed) {
            try {
                sock.send(DatagramPacket(PPPPProtocol.alive(), PPPPProtocol.alive().size, addr))
            } catch (_: Exception) { break }
            delay(5000)
        }
    }

    private suspend fun readLoop(sessionId: Int, sock: DatagramSocket, addr: InetSocketAddress) {
        val buf = ByteArray(4096)
        val session = sessions[sessionId]
        try {
            while (coroutineContext.isActive && !sock.isClosed) {
                try {
                    val dp = DatagramPacket(buf, buf.size)
                    sock.receive(dp)
                    val header = PPPPProtocol.parseHeader(dp.data) ?: continue
                    when (header.type) {
                        PPPPProtocol.MSG_DRW -> {
                            val payload = dp.data.copyOfRange(4, 4 + header.length.coerceAtMost(dp.length - 4))
                            val (seq, data) = PPPPProtocol.parseVideoDrw(payload) ?: continue
                            // ACK the packet so the camera keeps streaming.
                            val ack = PPPPProtocol.drwAck(PPPPProtocol.CH_VIDEO, seq)
                            sock.send(DatagramPacket(ack, ack.size, addr))
                            // Emit raw NAL bytes to JS as base64. Aggregation of
                            // fragmented NAL units into complete access units is
                            // done in JS or by A9VideoView's MediaCodec pipe.
                            val b64 = Base64.encodeToString(data, Base64.NO_WRAP)
                            emit("A9Camera:frame", Arguments.createMap().apply {
                                putInt("sessionId", sessionId)
                                putInt("seq", seq)
                                putString("nal", b64)
                                putInt("bytes", data.size)
                            })
                            session?.lastSeq = seq
                        }
                        PPPPProtocol.MSG_ALIVE_ACK -> { /* healthy */ }
                        PPPPProtocol.MSG_CLOSE -> {
                            emit("A9Camera:disconnected", Arguments.createMap().apply {
                                putInt("sessionId", sessionId)
                                putString("reason", "remote_close")
                            })
                            break
                        }
                        else -> Log.d(TAG, "unhandled type=0x${"%02X".format(header.type.toInt() and 0xFF)}")
                    }
                } catch (_: java.net.SocketTimeoutException) { /* poll */ }
                catch (e: Exception) { Log.w(TAG, "readLoop error: ${e.message}"); break }
            }
        } finally {
            emit("A9Camera:disconnected", Arguments.createMap().apply {
                putInt("sessionId", sessionId)
                putString("reason", "reader_end")
            })
        }
    }
}
