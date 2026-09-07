// PPPPProtocol — packet builders/parsers for the CS2 Network "PPPP" protocol
// used by cheap A9 / mini Wi-Fi cameras (iLnkP2P family).
//
// This is REVERSE-ENGINEERED from public analyses (Paul Marrapese's iLnkP2P
// research, PyPPPP, tuya-pppp). No official spec exists. The protocol is
// PROPRIETARY, UNSTABLE and cameras from different vendors implement variants.
//
// Packet layout (big-endian):
//   byte 0      : magic 0xF1
//   byte 1      : message type (see MSG_* constants)
//   bytes 2-3   : payload length (uint16 BE)
//   bytes 4..N  : payload
//
// This implementation covers the LAN discovery + local session subset that
// works with most A9 cameras when the phone is on the same Wi-Fi.
package com.emergent.securevaultsync.gbpwid.a9

import java.nio.ByteBuffer
import java.nio.ByteOrder

object PPPPProtocol {
    const val MAGIC: Byte = 0xF1.toByte()

    // Discovery + session
    const val MSG_HELLO: Byte = 0x00
    const val MSG_HELLO_ACK: Byte = 0x01
    const val MSG_P2P_REQ: Byte = 0x20
    const val MSG_LAN_SEARCH: Byte = 0x30
    const val MSG_LAN_SEARCH_EXT: Byte = 0x32
    const val MSG_PUNCH: Byte = 0x41
    const val MSG_P2P_RDY: Byte = 0x42
    const val MSG_ALIVE: Byte = 0xE0.toByte()
    const val MSG_ALIVE_ACK: Byte = 0xE1.toByte()
    const val MSG_CLOSE: Byte = 0xF0.toByte()
    const val MSG_DRW: Byte = 0xD0.toByte()
    const val MSG_DRW_ACK: Byte = 0xD1.toByte()

    // Channels used inside DRW packets
    const val CH_VIDEO: Byte = 0x00
    const val CH_AUDIO: Byte = 0x01
    const val CH_CMD: Byte = 0x03

    // Discovery ports commonly seen on A9 cameras (32100 is CS2 canonical;
    // some clones use 32108, 60000, 6001).
    val DISCOVERY_PORTS = intArrayOf(32100, 32108, 60000, 6001)

    /** Build a bare header packet (no payload). */
    fun header(type: Byte): ByteArray {
        val bb = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN)
        bb.put(MAGIC)
        bb.put(type)
        bb.putShort(0)
        return bb.array()
    }

    /** Build a packet with the given payload. */
    fun packet(type: Byte, payload: ByteArray): ByteArray {
        val bb = ByteBuffer.allocate(4 + payload.size).order(ByteOrder.BIG_ENDIAN)
        bb.put(MAGIC)
        bb.put(type)
        bb.putShort(payload.size.toShort())
        bb.put(payload)
        return bb.array()
    }

    /** LAN discovery broadcast — asks any camera on the subnet to identify. */
    fun lanSearch(): ByteArray = header(MSG_LAN_SEARCH)

    /** Alternate LAN search (older firmwares). */
    fun lanSearchExt(): ByteArray = header(MSG_LAN_SEARCH_EXT)

    /** Session open — client says hello to a discovered camera. */
    fun hello(): ByteArray = header(MSG_HELLO)

    /** Keep-alive heartbeat, sent every ~5 seconds. */
    fun alive(): ByteArray = header(MSG_ALIVE)

    /** Session close — polite disconnect. */
    fun close(): ByteArray = header(MSG_CLOSE)

    /** ACK a DRW packet by index (server-→ client packets are sequenced). */
    fun drwAck(channel: Byte, index: Int): ByteArray {
        val payload = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN)
        payload.put(channel)
        payload.put(0)
        payload.putShort(index.toShort())
        return packet(MSG_DRW_ACK, payload.array())
    }

    /**
     * Build a "start video stream" DRW command. Payload format after channel
     * headers is a small binary struct: command word (2 bytes) then params.
     * For A9-family cameras, command 0x01FF = "start realtime video".
     */
    fun startVideoStream(seq: Int, session: Int = 0): ByteArray {
        // DRW payload: [channel][magic 0xD1][seq BE (2)][cmd payload]
        val cmd = ByteBuffer.allocate(20).order(ByteOrder.LITTLE_ENDIAN)
        cmd.put(byteArrayOf(0x0A, 0x00))               // struct id
        cmd.put(byteArrayOf(0xFF.toByte(), 0x01))     // cmd 0x01FF start-realtime
        cmd.putInt(session)                            // session id (0 for LAN)
        cmd.put(byteArrayOf(0x00, 0x00, 0x00, 0x01))  // stream type = main
        cmd.put(byteArrayOf(0x00, 0x00, 0x00, 0x00))  // reserved
        cmd.put(byteArrayOf(0x00, 0x00, 0x00, 0x00))  // reserved
        val cmdBytes = cmd.array()

        val payload = ByteBuffer.allocate(4 + cmdBytes.size).order(ByteOrder.BIG_ENDIAN)
        payload.put(CH_CMD)
        payload.put(0xD1.toByte())
        payload.putShort(seq.toShort())
        payload.put(cmdBytes)
        return packet(MSG_DRW, payload.array())
    }

    /** Parse a header from bytes. Returns null if not a valid PPPP packet. */
    data class Header(val type: Byte, val length: Int)
    fun parseHeader(buf: ByteArray, offset: Int = 0): Header? {
        if (buf.size - offset < 4) return null
        if (buf[offset] != MAGIC) return null
        val len = ((buf[offset + 2].toInt() and 0xFF) shl 8) or
                  (buf[offset + 3].toInt() and 0xFF)
        return Header(buf[offset + 1], len)
    }

    /**
     * Extract a printable UID from a HELLO_ACK response. Cameras usually
     * return their UID in the form "PREFIX-XXXXXX-YYYYY" as ASCII in the
     * first 20 bytes of the payload.
     */
    fun extractUid(payload: ByteArray): String? {
        if (payload.isEmpty()) return null
        val end = payload.indexOfFirst { it == 0.toByte() }.let { if (it < 0) payload.size else it }
        val slice = payload.copyOfRange(0, end.coerceAtMost(24))
        val s = String(slice, Charsets.US_ASCII).trim()
        return if (s.isNotEmpty() && s.all { it.isLetterOrDigit() || it == '-' || it == '_' }) s else null
    }

    /**
     * Given a raw DRW payload (channel + magic + seq + data), returns the
     * inner data if it is a video channel packet, else null.
     */
    fun parseVideoDrw(payload: ByteArray): Pair<Int, ByteArray>? {
        if (payload.size < 4) return null
        if (payload[0] != CH_VIDEO) return null
        val seq = ((payload[2].toInt() and 0xFF) shl 8) or (payload[3].toInt() and 0xFF)
        val data = payload.copyOfRange(4, payload.size)
        return seq to data
    }
}
