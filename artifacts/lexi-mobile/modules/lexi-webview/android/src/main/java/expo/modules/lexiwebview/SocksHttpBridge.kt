package expo.modules.lexiwebview

import java.io.InputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Tiny local HTTP-CONNECT proxy that tunnels every request through an
 * upstream SOCKS5 proxy.
 *
 * Why this exists: Android's WebView (via androidx.webkit ProxyController)
 * only accepts HTTP/HTTPS proxies — there is no native SOCKS support.
 * To honor SOCKS-only backends like Tor without leaking direct, we boot
 * this bridge on 127.0.0.1, point the WebView at it, and forward every
 * accepted CONNECT (HTTPS) and absolute-URI HTTP request through SOCKS5.
 *
 * Bound to the loopback interface so nothing off-device can talk to it.
 */
internal class SocksHttpBridge(
  private val socksHost: String,
  private val socksPort: Int,
  private val socksUser: String? = null,
  private val socksPass: String? = null,
) {
  private val pool = Executors.newCachedThreadPool()
  @Volatile private var server: ServerSocket? = null
  private val running = AtomicBoolean(false)

  fun start(): Int {
    val s = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    server = s
    running.set(true)
    pool.submit { acceptLoop(s) }
    return s.localPort
  }

  fun stop() {
    running.set(false)
    try { server?.close() } catch (_: Throwable) {}
    pool.shutdownNow()
  }

  private fun acceptLoop(s: ServerSocket) {
    while (running.get() && !s.isClosed) {
      try {
        val client = s.accept()
        pool.submit { handle(client) }
      } catch (_: Throwable) {
        if (!running.get()) break
      }
    }
  }

  private fun handle(client: Socket) {
    try {
      client.soTimeout = 60_000
      val cIn = client.getInputStream()
      val cOut = client.getOutputStream()
      val headerBytes = ByteArray(16 * 1024)
      var read = 0
      var headerEnd = -1
      while (read < headerBytes.size) {
        val n = cIn.read(headerBytes, read, headerBytes.size - read)
        if (n <= 0) break
        read += n
        val str = String(headerBytes, 0, read, StandardCharsets.ISO_8859_1)
        val idx = str.indexOf("\r\n\r\n")
        if (idx >= 0) { headerEnd = idx + 4; break }
      }
      if (headerEnd < 0) { client.close(); return }
      val headerStr = String(headerBytes, 0, headerEnd, StandardCharsets.ISO_8859_1)
      val firstLine = headerStr.substringBefore("\r\n")
      val parts = firstLine.split(" ")
      if (parts.size < 3) { client.close(); return }
      val method = parts[0]
      val target = parts[1]

      if (method.equals("CONNECT", ignoreCase = true)) {
        val hp = parseHostPort(target) ?: run { writeError(cOut); client.close(); return }
        val upstream = openSocksTunnel(hp.first, hp.second) ?: run { writeError(cOut); client.close(); return }
        cOut.write("HTTP/1.1 200 OK\r\n\r\n".toByteArray()); cOut.flush()
        relay(client, upstream)
      } else {
        val u = try { URI(target) } catch (_: Throwable) { writeError(cOut); client.close(); return }
        val host = u.host ?: run { writeError(cOut); client.close(); return }
        val port = if (u.port > 0) u.port else 80
        val upstream = openSocksTunnel(host, port) ?: run { writeError(cOut); client.close(); return }
        val path = (if (u.rawPath.isNullOrEmpty()) "/" else u.rawPath) +
          (u.rawQuery?.let { "?$it" } ?: "")
        val rewritten = StringBuilder()
        rewritten.append(method).append(' ').append(path).append(' ').append(parts[2]).append("\r\n")
        // Append the rest of the headers verbatim (skip the original first line).
        rewritten.append(headerStr.substring(firstLine.length + 2))
        upstream.getOutputStream().write(rewritten.toString().toByteArray(StandardCharsets.ISO_8859_1))
        // Forward any body bytes already buffered after the header block.
        if (read > headerEnd) {
          upstream.getOutputStream().write(headerBytes, headerEnd, read - headerEnd)
        }
        upstream.getOutputStream().flush()
        relay(client, upstream)
      }
    } catch (_: Throwable) {
      try { client.close() } catch (_: Throwable) {}
    }
  }

  private fun writeError(out: java.io.OutputStream) {
    try { out.write("HTTP/1.1 502 Bad Gateway\r\n\r\n".toByteArray()) } catch (_: Throwable) {}
  }

  private fun parseHostPort(s: String): Pair<String, Int>? {
    val i = s.lastIndexOf(':')
    if (i <= 0) return null
    val h = s.substring(0, i)
    val p = s.substring(i + 1).toIntOrNull() ?: return null
    return h to p
  }

  private fun openSocksTunnel(host: String, port: Int): Socket? {
    return try {
      val s = Socket()
      s.connect(InetSocketAddress(socksHost, socksPort), 10_000)
      s.soTimeout = 60_000
      val out = s.getOutputStream()
      val inp = s.getInputStream()

      val auth = !socksUser.isNullOrEmpty()
      val greet = if (auth) byteArrayOf(0x05, 0x02, 0x00, 0x02) else byteArrayOf(0x05, 0x01, 0x00)
      out.write(greet); out.flush()

      val resp = ByteArray(2)
      if (readFully(inp, resp) != 2) { s.close(); return null }
      if (resp[0].toInt() != 0x05) { s.close(); return null }
      val chosen = resp[1].toInt() and 0xff
      when (chosen) {
        0x00 -> { /* no auth */ }
        0x02 -> {
          val u = (socksUser ?: "").toByteArray()
          val p = (socksPass ?: "").toByteArray()
          if (u.size > 255 || p.size > 255) { s.close(); return null }
          val msg = ByteArray(3 + u.size + p.size)
          msg[0] = 0x01; msg[1] = u.size.toByte()
          System.arraycopy(u, 0, msg, 2, u.size)
          msg[2 + u.size] = p.size.toByte()
          System.arraycopy(p, 0, msg, 3 + u.size, p.size)
          out.write(msg); out.flush()
          val authResp = ByteArray(2)
          if (readFully(inp, authResp) != 2 || authResp[1].toInt() != 0x00) { s.close(); return null }
        }
        else -> { s.close(); return null }
      }

      val hostBytes = host.toByteArray()
      if (hostBytes.size > 255) { s.close(); return null }
      val req = ByteArray(7 + hostBytes.size)
      req[0] = 0x05; req[1] = 0x01; req[2] = 0x00; req[3] = 0x03
      req[4] = hostBytes.size.toByte()
      System.arraycopy(hostBytes, 0, req, 5, hostBytes.size)
      req[5 + hostBytes.size] = ((port shr 8) and 0xff).toByte()
      req[6 + hostBytes.size] = (port and 0xff).toByte()
      out.write(req); out.flush()

      val head = ByteArray(4)
      if (readFully(inp, head) != 4) { s.close(); return null }
      if (head[1].toInt() != 0x00) { s.close(); return null }
      val atyp = head[3].toInt() and 0xff
      val rest = when (atyp) {
        0x01 -> 4 + 2
        0x03 -> {
          val l = ByteArray(1); if (readFully(inp, l) != 1) { s.close(); return null }
          (l[0].toInt() and 0xff) + 2
        }
        0x04 -> 16 + 2
        else -> { s.close(); return null }
      }
      val skip = ByteArray(rest)
      if (readFully(inp, skip) != rest) { s.close(); return null }
      s
    } catch (_: Throwable) {
      null
    }
  }

  private fun readFully(inp: InputStream, buf: ByteArray): Int {
    var read = 0
    while (read < buf.size) {
      val n = inp.read(buf, read, buf.size - read)
      if (n < 0) break
      read += n
    }
    return read
  }

  private fun relay(a: Socket, b: Socket) {
    val t1 = pool.submit { copyAndShutdown(a, b) }
    val t2 = pool.submit { copyAndShutdown(b, a) }
    try { t1.get(); t2.get() } catch (_: Throwable) {}
    try { a.close() } catch (_: Throwable) {}
    try { b.close() } catch (_: Throwable) {}
  }

  private fun copyAndShutdown(from: Socket, to: Socket) {
    try {
      val buf = ByteArray(16 * 1024)
      val inp = from.getInputStream()
      val out = to.getOutputStream()
      while (true) {
        val n = inp.read(buf)
        if (n < 0) break
        out.write(buf, 0, n); out.flush()
      }
    } catch (_: Throwable) {}
    try { to.shutdownOutput() } catch (_: Throwable) {}
  }
}

internal data class ProxyParts(val host: String, val port: Int, val user: String?, val pass: String?)

internal fun parseProxyUri(raw: String?): ProxyParts? {
  if (raw.isNullOrBlank()) return null
  val s = raw.trim()
  val withScheme = if (s.contains("://")) s else "http://$s"
  return try {
    val u = URI(withScheme)
    val host = u.host ?: return null
    if (u.port <= 0) return null
    var user: String? = null
    var pass: String? = null
    val info = u.userInfo
    if (!info.isNullOrEmpty()) {
      val parts = info.split(":", limit = 2)
      user = parts.getOrNull(0)
      pass = parts.getOrNull(1)
    }
    ProxyParts(host, u.port, user, pass)
  } catch (_: Throwable) { null }
}
