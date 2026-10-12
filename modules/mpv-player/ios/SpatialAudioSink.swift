#if os(tvOS) || os(iOS)
import AVFoundation
import MPVKit
import Synchronization
import SpatialAudioBridge
import SpatialAudioPlayback

/// Plays mpv's TrueHD and DTS-HD as Apple spatial audio (APAC). mpv decodes
/// these tracks to PCM, which loses the Atmos objects and DTS:X; with
/// `--ao=spatial` it hands the passthrough bursts here instead, and
/// SpatialAudioBridge renders them into the synchronizer mpv keeps its clock
/// on, so video, subtitles, seeking and track switching stay mpv's own.
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
	var isOpen: Bool { state.withLock { $0.renderer != nil } }

	private let callbacks = UnsafeMutablePointer<mpv_spatial_audio_sink>.allocate(capacity: 1)
	private let state = Mutex(State())
	/// Gets the `audio-spdif` name of a codec the library refused, and whether
	/// mpv's output is still on the session that refused it.
	private let onFailure: @Sendable (String, @escaping @Sendable () -> Bool) -> Void

	private struct State {
		var codec: SpatialAudioCodec?
		var renderer: SpatialAudioRenderer?
		var activator: AtmosOutputActivator?
		/// Feeds the current timeline; replaced on every begin().
		var timeline: Timeline?
		var generation = 0
		var readyGeneration = -1
		/// mpv's volume and mute, which never reach a bitstream.
		var volume: Float = 1
	}

	private struct Timeline {
		let bursts: AsyncStream<Data>.Continuation
		let feeder: Task<Void, Never>
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
			is_ready: { ctx in
				let sink = SpatialAudioSink.from(ctx)
				return sink.state.withLock { $0.readyGeneration == $0.generation }
			},
			// The player falls back itself (onFailure).
			has_failed: { _ in false },
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
		let renderer: SpatialAudioRenderer
		do {
			renderer = try SpatialAudioRenderer(codec: codec, synchronizer: synchronizer)
		} catch {
			Logger.shared.log("Spatial audio: cannot render \(codec): \(error)", type: "Warn")
			return false
		}
		state.withLock { state in
			state.codec = codec
			state.renderer = renderer
		}
		// The session itself is the engine's: it activates it for spatial
		// audio when mpv reports this output, and never after a shutdown.
		// The activator lives on the main actor; it follows the synchronizer's
		// rate, which mpv starts only once audio is queued.
		Task { @MainActor [weak self] in
			let activator = AtmosOutputActivator()
			activator.attach(to: synchronizer)
			// Only for the session this open() made: mpv can close and reopen
			// the output before this runs.
			guard let self, self.state.withLock({ state in
				guard state.renderer === renderer else { return false }
				state.activator = activator
				return true
			}) else {
				activator.detach()
				return
			}
		}
		Logger.shared.log("Spatial audio: playing \(codec) as APAC", type: "Info")
		return true
	}

	/// A new timeline after open, a seek or a reset: the previous feeder is
	/// stopped, and its renderer timeline discarded, before this one starts.
	private func begin(at nanoseconds: Int64) {
		let time = CMTime(value: nanoseconds, timescale: 1_000_000_000)
		let (bursts, input) = AsyncStream<Data>.makeStream()
		state.withLock { state in
			state.generation += 1
			let generation = state.generation
			let previous = state.timeline
			previous?.bursts.finish()
			previous?.feeder.cancel()
			guard let renderer = state.renderer else { return }
			let feeder = Task { [weak self] in
				guard let self else { return }
				await self.feed(bursts, into: renderer, from: time, after: previous?.feeder,
				                generation: generation)
			}
			state.timeline = Timeline(bursts: input, feeder: feeder)
		}
	}

	private func write(_ bursts: Data) {
		_ = state.withLock { $0.timeline }?.bursts.yield(bursts)
	}

	/// The feeder then flushes what the renderer holds back.
	private func end() {
		state.withLock { $0.timeline }?.bursts.finish()
	}

	/// After open() and on every change; mute arrives as 0.
	private func setVolume(_ volume: Float) {
		Logger.shared.log("Spatial audio: volume \(volume)", type: "Info")
		let renderer = state.withLock { state in
			state.volume = volume
			return state.renderer
		}
		guard let renderer else { return }
		Task { [weak self] in await self?.applyVolume(to: renderer) }
	}

	/// Reads the volume on the renderer's actor, so changes whose tasks run
	/// out of order still leave the latest.
	private func applyVolume(to renderer: isolated SpatialAudioRenderer) {
		renderer.setVolume(state.withLock { $0.volume })
	}

	private func close() {
		let (timeline, renderer, activator) = state.withLock { state in
			defer {
				// A new generation, so a feeder left from this session cannot
				// pass for the next one mpv opens on the same handle.
				state = State(generation: state.generation + 1)
			}
			return (state.timeline, state.renderer, state.activator)
		}
		timeline?.bursts.finish()
		timeline?.feeder.cancel()
		// Releases an enqueue the feeder may still wait in with the clock
		// stopped, so the renderer goes with it.
		if let renderer {
			Task { try? await renderer.begin(at: .zero) }
		}
		if let activator {
			Task { @MainActor in activator.detach() }
		}
	}

	// MARK: - Feeding the renderer

	private func feed(_ bursts: AsyncStream<Data>, into renderer: SpatialAudioRenderer, from time: CMTime,
	                  after previous: Task<Void, Never>?, generation: Int) async {
		do {
			// begin() releases an enqueue the previous feeder is still waiting
			// in; once that feeder has stopped, begin again to drop anything it
			// queued meanwhile.
			try await renderer.begin(at: time)
			await previous?.value
			try await renderer.begin(at: time)
			var unpacker = IEC61937Unpacker()
			var enqueued = false
			var ready = false
			for await chunk in bursts {
				let stream = try unpacker.unpack(chunk)
				guard !stream.isEmpty else { continue }
				// mpv's clock counts the TrueHD units before the first major
				// sync, which the unpacker drops; only the first enqueue's
				// time places the timeline.
				try await renderer.enqueue(stream, time: time + unpacker.skippedDuration)
				enqueued = true
				if !ready, await renderer.isReadyToPlay {
					ready = true
					state.withLock { state in
						if state.generation == generation { state.readyGeneration = generation }
					}
				}
			}
			// The audio ended: the encoder's last 1.5 s, or a stream shorter
			// than that, only plays once flushed.
			guard !Task.isCancelled else { return }
			if enqueued {
				do {
					try unpacker.finish()
				} catch {
					// What arrived still plays; a cut-off unit at the very end is
					// only worth a log line.
					Logger.shared.log("Spatial audio: the stream ended mid-unit, \(error)", type: "Warn")
				}
				try await renderer.endOfStream()
			}
			// Ready even with nothing to play, such as after a seek into the
			// last unit, so mpv's clock runs out what it wrote and reaches EOF.
			state.withLock { state in
				if state.generation == generation { state.readyGeneration = generation }
			}
		} catch is CancellationError {
		} catch {
			let codec = state.withLock { state in
				state.generation == generation ? state.codec : nil
			}
			if let codec {
				Logger.shared.log("Spatial audio: falling back to PCM, \(error)", type: "Warn")
				// The fallback lands later, on the player's queue; a seek since
				// then fails again and reports its own.
				onFailure(codec == .trueHDAtmos ? "truehd" : "dts-hd") { [weak self] in
					self?.state.withLock { $0.generation == generation } ?? false
				}
			}
		}
	}
}
#endif
