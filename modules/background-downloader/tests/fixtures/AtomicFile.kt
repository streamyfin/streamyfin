package android.util

import java.io.File
import java.io.FileOutputStream

/** JVM-only filesystem double; production uses the Android framework's AtomicFile. */
class AtomicFile(private val base: File) {
  private val pending = File("${base.path}.new")
  fun startWrite() = FileOutputStream(pending)
  fun finishWrite(stream: FileOutputStream) {
    stream.fd.sync()
    stream.close()
    check(pending.renameTo(base))
  }
  fun failWrite(stream: FileOutputStream) {
    stream.close()
    pending.delete()
  }
  fun readFully() = base.readBytes()
  fun delete() {
    base.delete()
    pending.delete()
  }
}
