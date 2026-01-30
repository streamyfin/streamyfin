import SwiftUI

/// SwiftUI view with tvOS 26 Liquid Glass effect
struct GlassPosterView: View {
  var imageUrl: String? = nil
  var aspectRatio: Double = 10.0 / 15.0
  var cornerRadius: Double = 24
  var progress: Double = 0
  var showWatchedIndicator: Bool = false
  var isFocused: Bool = false
  var width: Double = 260

  // Internal focus state for tvOS
  @FocusState private var isInternallyFocused: Bool

  // Combined focus state (external prop OR internal focus)
  private var isCurrentlyFocused: Bool {
    isFocused || isInternallyFocused
  }

  // Calculated height based on width and aspect ratio
  private var height: Double {
    width / aspectRatio
  }

  var body: some View {
    #if os(tvOS)
    if #available(tvOS 26.0, *) {
      glassContent
    } else {
      fallbackContent
    }
    #else
    fallbackContent
    #endif
  }

  // MARK: - tvOS 26+ Glass Effect

  #if os(tvOS)
  @available(tvOS 26.0, *)
  private var glassContent: some View {
    return ZStack {
      // Image content
      imageContent
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))

      // Progress bar overlay
      if progress > 0 {
        progressOverlay
      }

      // Watched indicator
      if showWatchedIndicator {
        watchedIndicatorOverlay
      }
    }
    .frame(width: width, height: height)
    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    .focusable()
    .focused($isInternallyFocused)
    .scaleEffect(isCurrentlyFocused ? 1.05 : 1.0)
    .animation(.easeOut(duration: 0.15), value: isCurrentlyFocused)
  }
  #endif

  // MARK: - Fallback for older tvOS versions

  private var fallbackContent: some View {
    ZStack {
      // Main image
      imageContent
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))

      // Subtle overlay for depth
      RoundedRectangle(cornerRadius: cornerRadius)
        .fill(.ultraThinMaterial.opacity(0.15))

      // Progress bar overlay
      if progress > 0 {
        progressOverlay
      }

      // Watched indicator
      if showWatchedIndicator {
        watchedIndicatorOverlay
      }
    }
    .frame(width: width, height: height)
    .scaleEffect(isFocused ? 1.05 : 1.0)
    .animation(.easeOut(duration: 0.15), value: isFocused)
  }

  // MARK: - Shared Components

  private var imageContent: some View {
    Group {
      if let urlString = imageUrl, let url = URL(string: urlString) {
        AsyncImage(url: url) { phase in
          switch phase {
          case .empty:
            placeholderView
          case .success(let image):
            image
              .resizable()
              .aspectRatio(contentMode: .fill)
              .frame(width: width, height: height)
              .clipped()
          case .failure:
            placeholderView
          @unknown default:
            placeholderView
          }
        }
      } else {
        placeholderView
      }
    }
  }

  private var placeholderView: some View {
    Rectangle()
      .fill(Color.gray.opacity(0.3))
  }

  private var progressOverlay: some View {
    VStack {
      Spacer()
      GeometryReader { geometry in
        ZStack(alignment: .leading) {
          // Background track
          Rectangle()
            .fill(Color.white.opacity(0.3))
            .frame(height: 4)

          // Progress fill
          Rectangle()
            .fill(Color.white)
            .frame(width: geometry.size.width * CGFloat(progress / 100), height: 4)
        }
      }
      .frame(height: 4)
    }
    .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
  }

  private var watchedIndicatorOverlay: some View {
    VStack {
      HStack {
        Spacer()
        ZStack {
          Circle()
            .fill(Color.white.opacity(0.9))
            .frame(width: 28, height: 28)

          Image(systemName: "checkmark")
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(.black)
        }
        .padding(8)
      }
      Spacer()
    }
  }
}

// MARK: - Preview

#if DEBUG
struct GlassPosterView_Previews: PreviewProvider {
  static var previews: some View {
    VStack(spacing: 20) {
      GlassPosterView(
        imageUrl: "https://image.tmdb.org/t/p/w500/example.jpg",
        aspectRatio: 10.0 / 15.0,
        cornerRadius: 24,
        progress: 45,
        showWatchedIndicator: false,
        isFocused: true,
        width: 260
      )

      GlassPosterView(
        imageUrl: "https://image.tmdb.org/t/p/w500/example.jpg",
        aspectRatio: 16.0 / 9.0,
        cornerRadius: 24,
        progress: 75,
        showWatchedIndicator: true,
        isFocused: false,
        width: 400
      )
    }
    .padding()
    .background(Color.black)
  }
}
#endif
