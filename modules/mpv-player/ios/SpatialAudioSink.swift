#if os(tvOS) || os(iOS)
import AVFoundation
import MPVKit
import Synchronization
import SpatialAudioBridge
import SpatialAudioPlayback

/// Plays mpv's TrueHD and DTS-HD as Apple spatial audio (APAC). mpv decodes
/// these tracks to PCM, which loses the Atmos objects and DTS:X; with
/// `--ao=spatial` it hands the passthrough bursts here instead, and
/// SpatialAudioBridge's passthrough sink renders them into the synchronizer
/// mpv keeps its clock on, so video, subtitles, seeking and track switching
/// stay mpv's own.
///
/// A stream the library cannot render, such as TrueHD without Atmos, fails
/// here and is reported through `onFailure`; the player then takes
/// passthrough off for that codec and selects the track again, so mpv decodes
/// it to PCM as it always has.
@available(iOS 26, tvOS 26, *)
final class SpatialAudioSink {
	/// The address mpv takes as `ao-spatial-sink`, valid while this lives.
	var address: Int64 { Int64(Int(bitPattern: callbacks)) }

	/// Whether mpv's output is open on a TrueHD or DTS-HD track.
	var isOpen: Bool { state.withLock { $0.output != nil } }

	/// mpv passes TrueHD and DTS-HD MA through as 192 kHz audio in eight
	/// 16-bit channels, which places a byte of the bursts in time.
	private static let bytesPerSecond: Int64 = 192_000 * 8 * 2
	/// The spatial output lets mpv write 3 s ahead of the clock, all of which
	/// can wait here before the clock starts.
	private static let bufferLimit = Int(bytesPerSecond) * 4

	private let callbacks = UnsafeMutablePointer<mpv_spatial_audio_sink>.allocate(capacity: 1)
	private let state = Mutex(State())
	/// Gets the `audio-spdif` name of a codec the library refused, and whether
	/// mpv's output is still on the timeline that refused it.
	private let onFailure: @Sendable (String, @escaping @Sendable () -> Bool) -> Void

	private struct State {
		var output: Output?
		/// Changes on every open, begin and close, so a fallback reported for
		/// one timeline is stale on the next.
		var generation = 0
	}

	/// What one open() of mpv's output plays through.
	private struct Output {
		let codec: SpatialAudioCodec
		let sink: SpatialAudioPassthroughSink
		var activator: AtmosOutputActivator?
		/// The current timeline's start on the synchronizer clock, in
		/// nanoseconds, and the bytes mpv has written to it since.
		var start: Int64 = 0
		var written: Int64 = 0
		/// mpv runs its clock once is_ready() says so, until the next begin.
		var clockRunning = false
		/// The failure has gone to the player, which falls back once.
		var failed = false

		/// Where the next byte mpv writes plays.
		var nextTime: CMTime {
			let offset = written / SpatialAudioSink.bytesPerSecond * 1_000_000_000
				+ written % SpatialAudioSink.bytesPerSecond * 1_000_000_000 / SpatialAudioSink.bytesPerSecond
			return CMTime(value: start + offset, timescale: 1_000_000_000)
		}
	}

	init(onFailure: @escaping @Sendable (String, @escaping @Sendable () -> Bool) -> Void) {
		self.onFailure = onFailure
		callbacks.initialize(to: mpv_spatial_audio_sink(
			version: Int32(MPV_SPATIAL_AUDIO_SINK_VERSION),
			ctx: nil,
			open: { ctx, codec, synchronizer in
				SpatialAudioSink.from(ctx).open(codec, synchronizer)
			},
			begin: { ctx, time in SpatialAudioSink.from(ctx).begin(at: time) },
			write: { ctx, data, size in
				guard let data else { return }
				SpatialAudioSink.from(ctx).write(Data(bytes: data, count: size))
			},
			is_ready: { ctx in SpatialAudioSink.from(ctx).isReady() },
			// The player falls back itself (onFailure), sooner than mpv would.
			has_failed: { ctx in
				SpatialAudioSink.from(ctx).checkFailure()
				return false
			},
			close: { ctx in SpatialAudioSink.from(ctx).close() },
			end: { ctx in SpatialAudioSink.from(ctx).end() },
			set_volume: { ctx, volume in SpatialAudioSink.from(ctx).setVolume(volume) }
		))
		callbacks.pointee.ctx = Unmanaged.passUnretained(self).toOpaque()
	}

	deinit {
		callbacks.deinitialize(count: 1)
		callbacks.deallocate()
	}

	private static func from(_ ctx: UnsafeMutableRawPointer?) -> SpatialAudioSink {
		Unmanaged<SpatialAudioSink>.fromOpaque(ctx!).takeUnretainedValue()
	}

	// MARK: - mpv's output, never concurrently except setVolume

	private func open(_ codec: mpv_spatial_audio_codec, _ synchronizerAddress: UnsafeMutableRawPointer?) -> Bool {
		guard let synchronizerAddress else { return false }
		let codec: SpatialAudioCodec = codec == MPV_SPATIAL_AUDIO_CODEC_TRUEHD ? .trueHDAtmos : .dtsX
		let synchronizer = Unmanaged<AVSampleBufferRenderSynchronizer>.fromOpaque(synchronizerAddress)
			.takeUnretainedValue()
		let sink: SpatialAudioPassthroughSink
		do {
			sink = try SpatialAudioPassthroughSink(codec: codec, synchronizer: synchronizer,
			                                       bufferLimit: Self.bufferLimit)
		} catch {
			Logger.shared.log("Spatial audio: cannot render \(codec): \(error)", type: "Warn")
			return false
		}
		state.withLock { state in
			state.generation += 1
			state.output = Output(codec: codec, sink: sink)
		}
		// The session itself is the engine's: it activates it for spatial
		// audio when mpv reports this output, and never after a shutdown.
		// The activator lives on the main actor; it follows the synchronizer's
		// rate, which mpv starts only once audio is queued.
		Task { @MainActor [weak self] in
			let activator = AtmosOutputActivator()
			activator.attach(to: synchronizer)
			// Only for the output this open() made: mpv can close and reopen
			// it before this runs.
			guard let self, self.state.withLock({ state in
				guard state.output?.sink === sink else { return false }
				state.output?.activator = activator
				return true
			}) else {
				activator.detach()
				return
			}
		}
		Logger.shared.log("Spatial audio: playing \(codec) as APAC", type: "Info")
		return true
	}

	/// A new timeline after open, a seek, a reset or an underrun.
	private func begin(at nanoseconds: Int64) {
		state.withLock { state in
			state.generation += 1
			guard var output = state.output else { return }
			output.start = nanoseconds
			output.written = 0
			output.clockRunning = false
			output.failed = false
			output.sink.begin(at: CMTime(value: nanoseconds, timescale: 1_000_000_000))
			state.output = output
		}
	}

	private func write(_ bursts: Data) {
		checkFailure()
		state.withLock { state in
			guard var output = state.output else { return }
			// After a discontinuity the sink takes nothing until a new
			// timeline begins where this audio plays; mpv's clock runs on.
			if output.clockRunning, Self.isDiscontinuity(output.sink.failure) {
				Logger.shared.log("Spatial audio: resuming after a discontinuity", type: "Info")
				output.sink.begin(at: output.nextTime)
			}
			// Takes everything (bufferLimit) unless the sink failed, which the
			// next check reports.
			output.sink.write(bursts)
			output.written += Int64(bursts.count)
			state.output = output
		}
	}

	private func isReady() -> Bool {
		state.withLock { state in
			guard let ready = state.output?.sink.isReady, ready else { return false }
			// mpv starts its clock on this answer.
			state.output?.clockRunning = true
			return true
		}
	}

	/// Hands a failure to the player once. A discontinuity is not one while
	/// mpv's clock runs: the next write begins again. Before that, mpv waits
	/// for the sink to become ready with its buffer already full, so nothing
	/// more would arrive to make it so, and the track falls back instead.
	private func checkFailure() {
		let failure: (codec: SpatialAudioCodec, error: any Error, generation: Int)? = state.withLock { state in
			guard var output = state.output, !output.failed, let error = output.sink.failure,
			      !(output.clockRunning && Self.isDiscontinuity(error)) else { return nil }
			output.failed = true
			state.output = output
			return (output.codec, error, state.generation)
		}
		guard let failure else { return }
		Logger.shared.log("Spatial audio: falling back to PCM, \(failure.error)", type: "Warn")
		// The fallback lands later, on the player's queue; a seek since then
		// fails again and reports its own.
		onFailure(failure.codec == .trueHDAtmos ? "truehd" : "dts-hd") { [weak self] in
			self?.state.withLock { $0.generation == failure.generation } ?? false
		}
	}

	/// The sink then flushes what the renderer holds back.
	private func end() {
		state.withLock { $0.output?.sink }?.end()
	}

	/// After open() and on every change; mute arrives as 0.
	private func setVolume(_ volume: Float) {
		Logger.shared.log("Spatial audio: volume \(volume)", type: "Info")
		state.withLock { $0.output?.sink }?.setVolume(volume)
	}

	private func close() {
		let output = state.withLock { state in
			defer {
				state.output = nil
				state.generation += 1
			}
			return state.output
		}
		output?.sink.close()
		if let activator = output?.activator {
			Task { @MainActor in activator.detach() }
		}
	}

	private static func isDiscontinuity(_ error: (any Error)?) -> Bool {
		if case .discontinuity = error as? SpatialAudioError { return true }
		return false
	}
}
#endif
