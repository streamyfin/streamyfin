package expo.modules.backgrounddownloader

import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Build
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.CancellationException
import kotlin.math.max
import kotlin.math.min

/**
 * Worker-thread-only packet copy. The caller owns atomic publication of outputPath.
 * MediaExtractor returns compressed H.264/AAC; no codec/decoder is instantiated.
 */
object DownloadRemuxer {
  private const val MAX_AUDIO_TRACKS = 32
  private const val MAX_PACKET_BYTES = 32 * 1024 * 1024
  private const val INITIAL_PACKET_BYTES = 1024 * 1024
  private const val NS_PER_US = 1000L

  init {
    System.loadLibrary("streamyfin_remux")
  }

  private class Input(val extractor: MediaExtractor, val format: MediaFormat, val video: Boolean) {
    var lastPtsUs = Long.MIN_VALUE
    var lastDurationNs = 0L
    var endUs = Long.MIN_VALUE
    val ptsUs: Long get() = extractor.sampleTime
    val ended: Boolean get() = extractor.sampleTrackIndex < 0
  }

  fun remux(
    videoPath: String,
    audioPaths: List<String>,
    audioTitles: List<String>,
    audioLanguages: List<String>,
    outputPath: String,
    onProgress: (Double) -> Unit,
    isCancelled: () -> Boolean,
  ) {
    require(audioPaths.size + 1 == audioTitles.size && audioTitles.size == audioLanguages.size) {
      "Invalid remux audio metadata"
    }
    require(audioTitles.size <= MAX_AUDIO_TRACKS) { "Too many audio tracks" }
    val output = File(outputPath).canonicalFile
    val paths = listOf(videoPath) + audioPaths
    require(!output.exists() && paths.none { File(it).canonicalFile == output }) {
      "Remux output must be a new temporary file, distinct from its inputs"
    }
    fun checkCancelled() {
      if (isCancelled()) throw CancellationException("Download remux cancelled")
    }
    val inputs = mutableListOf<Input>()
    val audioConfigs = mutableListOf<ByteArray>()
    val audioRates = mutableListOf<Int>()
    val audioChannels = mutableListOf<Int>()
    var handle = 0L
    var createdOutput = false
    var succeeded = false
    try {
      checkCancelled()
      onProgress(0.0)
      var videoConfig = byteArrayOf()
      var width = 0
      var height = 0
      var durationUs = 0L
      var bufferSize = INITIAL_PACKET_BYTES
      paths.forEachIndexed { index, path ->
        checkCancelled()
        val probe = MediaExtractor()
        try {
          probe.setDataSource(path)
          require(probe.drmInitData == null && probe.trackCount == 2) {
            "Expected one unencrypted H.264 and one AAC track per MP4"
          }
          val formats = (0 until probe.trackCount).map { probe.getTrackFormat(it) }
          val videoTracks = formats.indices.filter { formats[it].getString(MediaFormat.KEY_MIME) == "video/avc" }
          val audioTracks = formats.indices.filter { formats[it].getString(MediaFormat.KEY_MIME) == "audio/mp4a-latm" }
          require(videoTracks.size == 1 && audioTracks.size == 1) {
            "Expected one H.264 and one AAC track per MP4"
          }
          fun select(track: Int, video: Boolean): Input {
            val extractor = MediaExtractor()
            try {
              extractor.setDataSource(path)
              extractor.selectTrack(track)
              val input = Input(extractor, formats[track], video)
              inputs.add(input)
              require(!input.ended) { "Empty MP4 input track" }
              return input
            } catch (error: Throwable) {
              if (inputs.none { it.extractor === extractor }) extractor.release()
              throw error
            }
          }
          val videoFormat = formats[videoTracks.single()]
          val config = codecData(videoFormat, "csd-0") +
            (videoFormat.getByteBuffer("csd-1")?.let(::bytes) ?: byteArrayOf())
          require(nativeIsBaselineAvc(config)) { "Only H.264 Baseline input is supported" }
          if (index == 0) {
            videoConfig = config
            width = videoFormat.getInteger(MediaFormat.KEY_WIDTH)
            height = videoFormat.getInteger(MediaFormat.KEY_HEIGHT)
            select(videoTracks.single(), true)
          }
          val audio = select(audioTracks.single(), false)
          audioConfigs.add(codecData(audio.format, "csd-0"))
          audioRates.add(audio.format.getInteger(MediaFormat.KEY_SAMPLE_RATE))
          audioChannels.add(audio.format.getInteger(MediaFormat.KEY_CHANNEL_COUNT))
          for (format in formats) {
            if (format.containsKey(MediaFormat.KEY_DURATION)) {
              durationUs = max(durationUs, format.getLong(MediaFormat.KEY_DURATION))
            }
            if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
              val size = format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE)
              require(size in 1..MAX_PACKET_BYTES) { "MP4 packet exceeds size limit" }
              bufferSize = max(bufferSize, size)
            }
          }
        } finally {
          probe.release()
        }
      }
      // API 26/27 lack sampleSize. A single reusable bounded buffer handles those
      // versions too, without one maximum-sized allocation per audio track.
      if (Build.VERSION.SDK_INT < 28) bufferSize = MAX_PACKET_BYTES
      var buffer = ByteBuffer.allocateDirect(bufferSize)
      val originUs = min(0, inputs.minOf { it.ptsUs })
      handle = nativeCreate(
        output.path, videoConfig, width, height, audioConfigs.toTypedArray(),
        audioRates.toIntArray(), audioChannels.toIntArray(),
        audioTitles.toTypedArray(), audioLanguages.toTypedArray(),
      )
      createdOutput = true
      var reported = 0.0
      while (true) {
        checkCancelled()
        val track = inputs.indices.filter { !inputs[it].ended }.minByOrNull { inputs[it].ptsUs } ?: break
        val input = inputs[track]
        val ptsUs = input.ptsUs
        require(ptsUs > input.lastPtsUs) { "Reordered or invalid MP4 packet timestamps" }
        input.lastPtsUs = ptsUs
        val flags = input.extractor.sampleFlags
        require(flags and (MediaExtractor.SAMPLE_FLAG_ENCRYPTED or MediaExtractor.SAMPLE_FLAG_PARTIAL_FRAME) == 0) {
          "Encrypted or fragmented MP4 packets are unsupported"
        }
        if (Build.VERSION.SDK_INT >= 28) {
          val size = input.extractor.sampleSize
          require(size in 1..MAX_PACKET_BYTES.toLong()) { "MP4 packet exceeds size limit" }
          if (size > buffer.capacity()) buffer = ByteBuffer.allocateDirect(size.toInt())
        }
        buffer.clear()
        val length = input.extractor.readSampleData(buffer, 0)
        require(length in 1..buffer.capacity()) { "Cannot read compressed MP4 packet" }
        input.extractor.advance()
        val durationNs = if (input.video) {
          if (!input.ended) {
            Math.multiplyExact(input.ptsUs - ptsUs, NS_PER_US)
          } else {
            val remaining = if (input.format.containsKey(MediaFormat.KEY_DURATION)) {
              Math.multiplyExact(input.format.getLong(MediaFormat.KEY_DURATION) - ptsUs, NS_PER_US)
            } else 0
            // An early extractor EOF must not stretch the last frame over the
            // missing tail of a truncated file.
            if (remaining > 0 && (input.lastDurationNs == 0L || remaining <= input.lastDurationNs * 2)) {
              remaining
            } else input.lastDurationNs
          }
        } else {
          1_024_000_000_000L / input.format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        }
        require(durationNs > 0) { "Invalid MP4 packet duration" }
        input.lastDurationNs = durationNs
        input.endUs = Math.addExact(ptsUs, durationNs / NS_PER_US)
        nativeWrite(
          handle, track, buffer, length,
          Math.multiplyExact(Math.subtractExact(ptsUs, originUs), NS_PER_US),
          durationNs, !input.video || flags and MediaExtractor.SAMPLE_FLAG_SYNC != 0,
        )
        val progress = min(0.99, (ptsUs - originUs).toDouble() / max(1, durationUs - originUs))
        if (progress - reported >= 0.01) {
          onProgress(progress)
          reported = progress
        }
      }
      for (input in inputs) {
        if (input.format.containsKey(MediaFormat.KEY_DURATION)) {
          val expectedEndUs = input.format.getLong(MediaFormat.KEY_DURATION)
          val toleranceUs = input.lastDurationNs / NS_PER_US * 2
          require(input.endUs >= expectedEndUs - toleranceUs) {
            "Truncated MP4 input track"
          }
        }
      }
      checkCancelled()
      nativeFinish(handle)
      checkCancelled()
      onProgress(1.0)
      succeeded = true
    } finally {
      if (handle != 0L) nativeDestroy(handle)
      inputs.forEach { it.extractor.release() }
      if (createdOutput && !succeeded) output.delete()
    }
  }

  private fun bytes(buffer: ByteBuffer): ByteArray {
    val copy = buffer.duplicate()
    require(copy.remaining() in 1..MAX_PACKET_BYTES) { "Invalid codec configuration" }
    return ByteArray(copy.remaining()).also { copy.get(it) }
  }

  private fun codecData(format: MediaFormat, name: String): ByteArray =
    bytes(requireNotNull(format.getByteBuffer(name)) { "Missing codec configuration" })

  private external fun nativeIsBaselineAvc(configuration: ByteArray): Boolean
  private external fun nativeCreate(
    path: String, avc: ByteArray, width: Int, height: Int,
    audio: Array<ByteArray>, rates: IntArray, channels: IntArray,
    titles: Array<String>, languages: Array<String>,
  ): Long
  private external fun nativeWrite(
    handle: Long, track: Int, packet: ByteBuffer, size: Int,
    ptsNs: Long, durationNs: Long, keyframe: Boolean,
  )
  private external fun nativeFinish(handle: Long)
  private external fun nativeDestroy(handle: Long)
}
