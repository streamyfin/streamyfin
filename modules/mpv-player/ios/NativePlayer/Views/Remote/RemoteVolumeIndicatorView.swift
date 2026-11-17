#if os(iOS)
import SwiftUI

/// The TV's level for a moment after it changes (VolumeIndicatorModel): the Cast glyph, then a bar, dimmed and
/// followed by a muted icon when the TV is muted. Hidden from VoiceOver, like the Android twin
/// (RemoteVolumeIndicator.kt). Its fade follows the model's show and hide.
struct RemoteVolumeIndicatorView: View {
	let indicator: VolumeIndicator?

	var body: some View {
		ZStack {
			if let indicator {
				HStack(spacing: 10) {
					CastGlyph(connected: true)
						.fill(Color.white)
						.frame(width: 20, height: 20)
					GeometryReader { bar in
						ZStack(alignment: .leading) {
							Capsule().fill(Color.white.opacity(0.3))
							Capsule()
								.fill(Color.white)
								.frame(width: bar.size.width * CGFloat(min(max(indicator.level, 0), 1)))
						}
					}
					.frame(width: 140, height: 4)
					.opacity(indicator.muted ? 0.4 : 1)
					if indicator.muted {
						Image(systemName: "speaker.slash.fill")
							.font(.system(size: 16))
							.foregroundStyle(Color.white)
					}
				}
				.padding(.horizontal, 14)
				.padding(.vertical, 10)
				.background(Capsule().fill(Color.black.opacity(0.6)))
				.padding(.top, 8)
				.transition(.opacity)
			}
		}
		.animation(.easeInOut(duration: 0.2), value: indicator)
		.accessibilityHidden(true)
		.allowsHitTesting(false)
	}
}
#endif
