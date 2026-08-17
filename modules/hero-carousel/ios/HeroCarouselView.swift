import SwiftUI
import UIKit

// MARK: - Root

/// Entry point hosted by the ExpoView. iOS 17+ gets the paged ScrollView with
/// interactive parallax; iOS 15/16 falls back to a paged TabView without the
/// scroll-driven effects. tvOS never renders (the TV home has its own hero).
struct HeroCarouselRootView: View {
  @ObservedObject var state: HeroCarouselState
  let onItemPress: (String) -> Void
  let onFilterToggle: (String) -> Void

  var body: some View {
    #if os(iOS)
    Group {
      if state.items.isEmpty {
        // Loading / no-data placeholder: a faint card skeleton where the
        // hero will appear.
        HeroSkeletonView()
      } else if #available(iOS 17.0, *) {
        PagedHeroCarousel(
          items: state.items,
          headers: state.imageHeaders,
          onItemPress: onItemPress
        )
      } else {
        LegacyHeroCarousel(
          items: state.items,
          headers: state.imageHeaders,
          onItemPress: onItemPress
        )
      }
    }
    // Overlaid here rather than inside a card for two reasons: neighbour
    // cards peek in at the edges, so a per-card button would show a second
    // half-clipped copy in the slivers; and filtering down to zero items
    // must not strand the user without a way to undo it, so the button has
    // to outlive the carousel and sit over the empty-state skeleton too.
    .overlay(alignment: .topTrailing) {
      if filter.isAvailable {
        HeroFilterMenu(filter: filter)
          .padding(.top, 12)
          .padding(.trailing, HeroLayout.pageMargin + 12)
      }
    }
    // The app is dark themed; force dark so the glass materials render dark
    // regardless of the system setting.
    .environment(\.colorScheme, .dark)
    #else
    EmptyView()
    #endif
  }

  #if os(iOS)
  private var filter: HeroFilterConfig {
    HeroFilterConfig(
      sections: state.filterSections,
      label: state.filterLabel,
      onToggle: onFilterToggle
    )
  }
  #endif
}

#if os(iOS)

private enum HeroLayout {
  /// Horizontal inset of the snapped card. Neighbors peek through it:
  /// visible sliver ≈ pageMargin - cardSpacing (minus the 0.95 scale shrink).
  static let pageMargin: CGFloat = 36
  static let cardSpacing: CGFloat = 12
  static let cardCornerRadius: CGFloat = 28
  /// Extra backdrop width on each side, consumed by the parallax pan.
  static let parallaxAmount: CGFloat = 36
  /// Vertical space reserved under the cards for the page dots.
  static let dotsArea: CGFloat = 24
}

// MARK: - Filter

/// Everything the filter button needs, bundled so both carousel variants can
/// take it as one parameter.
struct HeroFilterConfig {
  let sections: [HeroFilterSection]
  let label: String
  let onToggle: (String) -> Void

  var isAvailable: Bool {
    !sections.isEmpty
  }
}

/// Glass button in the card's top-right corner, mirroring the label chip on
/// the left. Opens a native menu whose rows are `Toggle`s, so iOS renders the
/// standard checkmark treatment and handles dismissal itself.
private struct HeroFilterMenu: View {
  let filter: HeroFilterConfig

  var body: some View {
    Menu {
      ForEach(filter.sections) { section in
        if let title = section.title, !title.isEmpty {
          Section(title) { rows(section) }
        } else {
          Section { rows(section) }
        }
      }
    } label: {
      Image(systemName: "line.3.horizontal.decrease")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(.white.opacity(0.95))
        .frame(width: 32, height: 32)
        .background(.ultraThinMaterial, in: Circle())
        .overlay(Circle().strokeBorder(Color.white.opacity(0.15), lineWidth: 0.5))
    }
    .accessibilityLabel(filter.label)
  }

  @ViewBuilder
  private func rows(_ section: HeroFilterSection) -> some View {
    ForEach(section.options) { option in
      if option.destructive == true {
        // A one-way action, not a filter: it is only ever reachable while
        // the thing it turns off is on, so a checkmark would say nothing.
        Button(role: .destructive) {
          filter.onToggle(option.key)
        } label: {
          Text(option.label)
        }
      } else {
        Toggle(
          option.label,
          isOn: Binding(
            get: { option.enabled },
            // The caller owns the state; this only reports the intent.
            set: { _ in filter.onToggle(option.key) }
          )
        )
      }
    }
  }
}

// MARK: - Skeleton

struct HeroSkeletonView: View {
  var body: some View {
    GeometryReader { proxy in
      RoundedRectangle(
        cornerRadius: HeroLayout.cardCornerRadius, style: .continuous
      )
      .fill(Color.white.opacity(0.06))
      .overlay(
        RoundedRectangle(
          cornerRadius: HeroLayout.cardCornerRadius, style: .continuous
        )
        .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
      )
      .padding(.horizontal, HeroLayout.pageMargin)
      .frame(height: max(proxy.size.height - HeroLayout.dotsArea, 0))
    }
  }
}

// MARK: - Wrap-around slides

/// The carousel wraps by rendering a clone of the last item before the first
/// and a clone of the first after the last. When the scroll settles on a
/// clone, the position teleports (without animation) to its real twin —
/// pixel-identical content, so the jump is invisible.
private struct HeroSlide: Identifiable, Equatable {
  let id: String
  let item: HeroItem
  /// Index into the real items array (clones map to their twin's index).
  let realIndex: Int
  let isSentinel: Bool
}

private func makeHeroSlides(_ items: [HeroItem]) -> [HeroSlide] {
  guard items.count > 1, let first = items.first, let last = items.last else {
    return items.enumerated().map { index, item in
      HeroSlide(
        id: "real-\(index)-\(item.id)", item: item, realIndex: index,
        isSentinel: false)
    }
  }
  var slides: [HeroSlide] = [
    HeroSlide(
      id: "lead-\(last.id)", item: last, realIndex: items.count - 1,
      isSentinel: true)
  ]
  for (index, item) in items.enumerated() {
    slides.append(
      HeroSlide(
        id: "real-\(index)-\(item.id)", item: item, realIndex: index,
        isSentinel: false))
  }
  slides.append(
    HeroSlide(id: "trail-\(first.id)", item: first, realIndex: 0, isSentinel: true)
  )
  return slides
}

// MARK: - iOS 17+ carousel

@available(iOS 17.0, *)
private struct PagedHeroCarousel: View {
  let items: [HeroItem]
  let headers: [String: String]
  let onItemPress: (String) -> Void

  @State private var scrolledID: String?
  /// The scroll starts at offset 0, which is the leading wrap clone, and
  /// `scrollPosition(id:)` cannot be seeded before the first layout. So the
  /// jump to the first real slide happens right after layout, and wrap
  /// handling stays disabled until then — otherwise the clone the scroll
  /// settles on first would wrap us to the *last* item.
  @State private var hasSeededPosition = false

  private var slides: [HeroSlide] { makeHeroSlides(items) }

  private var firstRealID: String? {
    slides.first(where: { !$0.isSentinel })?.id
  }

  var body: some View {
    GeometryReader { proxy in
      let dotsArea = items.count > 1 ? HeroLayout.dotsArea : 0
      VStack(spacing: 0) {
        ScrollView(.horizontal) {
          // A plain HStack, not LazyHStack: the scroll position is seeded to
          // the first real slide before the first layout, and a lazy stack
          // can't resolve a scroll target it hasn't measured yet — that
          // renders the whole ScrollView blank. With ≤10 slides laziness
          // buys nothing (images load per-card via .task anyway).
          HStack(spacing: HeroLayout.cardSpacing) {
            ForEach(slides) { slide in
              HeroCardView(
                item: slide.item,
                headers: headers,
                onPress: { onItemPress(slide.item.id) }
              )
              // contentMargins already insets the container, so the full
              // relative width is the card width; the snapped card sits
              // centered with a neighbor sliver on each side.
              .containerRelativeFrame(.horizontal)
              .scrollTransition(.interactive, axis: .horizontal) { content, phase in
                content
                  .scaleEffect(phase.isIdentity ? 1 : 0.95)
              }
            }
          }
          .scrollTargetLayout()
        }
        .frame(height: max(proxy.size.height - dotsArea, 0))
        .contentMargins(.horizontal, HeroLayout.pageMargin, for: .scrollContent)
        // `.always`, not the default `.automatic`: automatic only limits a
        // fling to one page in a compact size class, so on iPad (regular)
        // a flick would sail past several cards at once.
        .scrollTargetBehavior(.viewAligned(limitBehavior: .always))
        .scrollPosition(id: $scrolledID)
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
        // Not `.onChange(of: scrolledID)`: with `.viewAligned` the binding
        // updates to the target page the moment the finger lifts, i.e. as
        // deceleration *starts*. Teleporting there cuts the snap animation
        // dead, which is why only the wrapping swipes looked broken.
        .heroWrapWhenScrollIdle(trigger: scrolledID) {
          wrapIfNeeded()
        }
        .onChange(of: items) { _, _ in
          // Data changed under us (e.g. pull-to-refresh); if the current
          // position no longer exists, snap back to the start.
          if !slides.contains(where: { $0.id == scrolledID }) {
            teleport(to: firstRealID)
          }
        }
        .onAppear {
          guard !hasSeededPosition else { return }
          // Next runloop tick: the scroll view has laid out by then, so the
          // position actually takes.
          DispatchQueue.main.async {
            teleport(to: firstRealID)
            hasSeededPosition = true
          }
        }

        if items.count > 1 {
          HeroPageDots(count: items.count, activeIndex: activeIndex) { index in
            jump(toRealIndex: index)
          }
          .frame(height: dotsArea)
        }
      }
    }
  }

  private var activeIndex: Int {
    // Before the seed lands the scroll sits on the leading clone; report the
    // first page rather than briefly lighting up the last dot.
    guard hasSeededPosition, let scrolledID,
      let slide = slides.first(where: { $0.id == scrolledID })
    else { return 0 }
    return slide.realIndex
  }

  /// Reads the live `scrolledID` rather than a captured one: this runs after
  /// the scroll settles, by which point the position may have moved on.
  private func wrapIfNeeded() {
    guard hasSeededPosition,
      let id = scrolledID,
      let slide = slides.first(where: { $0.id == id }),
      slide.isSentinel
    else { return }
    teleport(
      to: slides.first(where: { !$0.isSentinel && $0.realIndex == slide.realIndex })?.id
    )
  }

  private func teleport(to id: String?) {
    guard let id else { return }
    var transaction = Transaction()
    transaction.disablesAnimations = true
    withTransaction(transaction) { scrolledID = id }
  }

  private func jump(toRealIndex index: Int) {
    guard
      let target = slides.first(where: { !$0.isSentinel && $0.realIndex == index })
    else { return }
    withAnimation(.snappy) { scrolledID = target.id }
  }
}

// MARK: - iOS 15/16 fallback

private struct LegacyHeroCarousel: View {
  let items: [HeroItem]
  let headers: [String: String]
  let onItemPress: (String) -> Void

  @State private var selection: Int

  private var slides: [HeroSlide] { makeHeroSlides(items) }

  init(
    items: [HeroItem],
    headers: [String: String],
    onItemPress: @escaping (String) -> Void
  ) {
    self.items = items
    self.headers = headers
    self.onItemPress = onItemPress
    // Slide 0 is the leading wrap clone whenever there is more than one item.
    _selection = State(initialValue: items.count > 1 ? 1 : 0)
  }

  var body: some View {
    GeometryReader { proxy in
      let dotsArea = items.count > 1 ? HeroLayout.dotsArea : 0
      VStack(spacing: 0) {
        TabView(selection: $selection) {
          ForEach(Array(slides.enumerated()), id: \.element.id) { index, slide in
            HeroCardView(
              item: slide.item,
              headers: headers,
              onPress: { onItemPress(slide.item.id) }
            )
            .padding(.horizontal, HeroLayout.pageMargin)
            .tag(index)
          }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .frame(height: max(proxy.size.height - dotsArea, 0))
        .onChange(of: selection) { _ in
          // Wait out the page animation before swapping a wrap clone for its
          // real twin, otherwise the teleport cuts the animation short.
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            wrapIfNeeded()
          }
        }
        .onChange(of: items) { newItems in
          // Filtering can shrink the list under us. TabView renders a blank
          // page when `selection` names a tag that no longer exists, and
          // every other handler here guards on `indices.contains`, so
          // nothing would recover it. The iOS 17 path does the same reset.
          guard !makeHeroSlides(newItems).indices.contains(selection) else {
            return
          }
          var transaction = Transaction()
          transaction.disablesAnimations = true
          withTransaction(transaction) {
            selection = newItems.count > 1 ? 1 : 0
          }
        }

        if items.count > 1 {
          HeroPageDots(count: items.count, activeIndex: currentRealIndex) { index in
            if let target = slides.firstIndex(where: {
              !$0.isSentinel && $0.realIndex == index
            }) {
              withAnimation { selection = target }
            }
          }
          .frame(height: dotsArea)
        }
      }
    }
  }

  private var currentRealIndex: Int {
    guard slides.indices.contains(selection) else { return 0 }
    return slides[selection].realIndex
  }

  /// Reads the live `selection` rather than a captured one: this runs after
  /// the page animation, by which point the selection may have moved on.
  private func wrapIfNeeded() {
    guard slides.indices.contains(selection), slides[selection].isSentinel
    else { return }
    let realIndex = slides[selection].realIndex
    guard
      let target = slides.firstIndex(where: {
        !$0.isSentinel && $0.realIndex == realIndex
      })
    else { return }
    var transaction = Transaction()
    transaction.disablesAnimations = true
    withTransaction(transaction) { selection = target }
  }
}

// MARK: - Card

private struct HeroCardView: View {
  let item: HeroItem
  let headers: [String: String]
  let onPress: () -> Void

  var body: some View {
    GeometryReader { geo in
      let shape = RoundedRectangle(
        cornerRadius: HeroLayout.cardCornerRadius, style: .continuous)

      Button(action: onPress) {
        ZStack {
          // Backdrop, wider than the card so the parallax pan never
          // exposes an edge.
          RemoteHeroImage(urlString: item.backdropUrl, headers: headers)
            .frame(
              width: geo.size.width + HeroLayout.parallaxAmount * 2,
              height: geo.size.height
            )
            .clipped()
            .heroParallax(HeroLayout.parallaxAmount)
            .frame(width: geo.size.width, height: geo.size.height)

          // Scrim so the glass panel and label stay legible on bright art.
          LinearGradient(
            stops: [
              .init(color: .black.opacity(0.25), location: 0),
              .init(color: .clear, location: 0.3),
              .init(color: .clear, location: 0.45),
              .init(color: .black.opacity(0.65), location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom
          )

          VStack(alignment: .leading, spacing: 0) {
            if let label = item.label, !label.isEmpty {
              HStack {
                labelChip(label, icon: item.labelIcon)
                Spacer()
              }
            }
            Spacer(minLength: 0)
            infoPanel
          }
          .padding(12)
        }
        .frame(width: geo.size.width, height: geo.size.height)
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
        .contentShape(shape)
      }
      .buttonStyle(HeroCardPressStyle())
      .shadow(color: .black.opacity(0.35), radius: 16, x: 0, y: 10)
    }
  }

  private func labelChip(_ label: String, icon: String?) -> some View {
    HStack(spacing: 4) {
      if let icon, !icon.isEmpty {
        Image(systemName: icon)
          .font(.system(size: 10, weight: .semibold))
      }
      Text(label.uppercased())
        .font(.system(size: 10, weight: .heavy))
        .kerning(0.8)
    }
    .foregroundStyle(.white.opacity(0.95))
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(.ultraThinMaterial, in: Capsule())
    .overlay(Capsule().strokeBorder(Color.white.opacity(0.15), lineWidth: 0.5))
  }

  private var infoPanel: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center, spacing: 12) {
        if let posterUrl = item.posterUrl {
          RemoteHeroImage(urlString: posterUrl, headers: headers)
            .frame(width: 62, height: 93)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
              RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.white.opacity(0.15), lineWidth: 0.5)
            )
        }

        VStack(alignment: .leading, spacing: 4) {
          HeroLogoView(
            urlString: item.logoUrl,
            headers: headers,
            title: item.title
          )

          if let subtitle = item.subtitle, !subtitle.isEmpty {
            Text(subtitle)
              .font(.caption.weight(.semibold))
              .foregroundStyle(.white.opacity(0.9))
              .lineLimit(1)
          }

          if !item.overview.isEmpty {
            Text(item.overview)
              .font(.caption)
              .foregroundStyle(.white.opacity(0.75))
              .lineLimit(2)
              .multilineTextAlignment(.leading)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }

      // Full panel width so the chips never get squeezed into ellipses by
      // the poster column.
      badgesRow

      if let progress = item.progress, progress > 0.01 {
        progressBar(progress)
      }
    }
    .padding(12)
    .background(
      .ultraThinMaterial,
      in: RoundedRectangle(cornerRadius: 20, style: .continuous)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .strokeBorder(Color.white.opacity(0.1), lineWidth: 1)
    )
  }

  private var badgesRow: some View {
    HStack(spacing: 6) {
      if let rating = item.communityRating {
        HStack(spacing: 3) {
          Image(systemName: "star.fill")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(.yellow)
          Text(String(format: "%.1f", rating))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.white.opacity(0.9))
        }
        .fixedSize()
        .heroBadgeChip()
      }

      ForEach(Array(item.badges.enumerated()), id: \.offset) { _, badge in
        Text(badge)
          .font(.caption2.weight(.semibold))
          .foregroundStyle(.white.opacity(0.9))
          .fixedSize()
          .heroBadgeChip()
      }
    }
    .lineLimit(1)
    // Chips render at full size and the rare overflow clips at the panel
    // edge instead of every chip degrading into "...".
    .frame(maxWidth: .infinity, alignment: .leading)
    .clipped()
  }

  private func progressBar(_ progress: Double) -> some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule()
          .fill(Color.white.opacity(0.2))
        Capsule()
          .fill(Color.white.opacity(0.9))
          .frame(width: max(geo.size.width * min(max(progress, 0), 1), 4))
      }
    }
    .frame(height: 3)
  }
}

private struct HeroCardPressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? 0.97 : 1)
      .animation(
        .spring(response: 0.3, dampingFraction: 0.7),
        value: configuration.isPressed
      )
  }
}

// MARK: - Page dots

/// Tappable and scrubbable: touching down jumps to the nearest dot's page,
/// dragging across the strip flies through the carousel.
private struct HeroPageDots: View {
  let count: Int
  let activeIndex: Int
  let onSelect: (Int) -> Void

  private static let haptics = UISelectionFeedbackGenerator()

  var body: some View {
    HStack(spacing: 6) {
      ForEach(0..<count, id: \.self) { index in
        Capsule()
          .fill(Color.white.opacity(index == activeIndex ? 0.9 : 0.3))
          .frame(width: index == activeIndex ? 18 : 6, height: 6)
      }
    }
    .animation(
      .spring(response: 0.35, dampingFraction: 0.8), value: activeIndex
    )
    .padding(.horizontal, 12)
    .frame(maxHeight: .infinity)
    .contentShape(Rectangle())
    .overlay {
      GeometryReader { geo in
        Color.clear
          .contentShape(Rectangle())
          .gesture(
            // minimumDistance 0 so a plain tap selects on touch-down. The
            // surrounding RN scroll view still wins vertical pans (it
            // cancels content touches), so page scrolling isn't blocked.
            DragGesture(minimumDistance: 0)
              .onChanged { value in
                let step = geo.size.width / CGFloat(count)
                guard step > 0 else { return }
                let index = min(
                  max(Int(value.location.x / step), 0), count - 1)
                if index != activeIndex {
                  Self.haptics.selectionChanged()
                  onSelect(index)
                }
              }
          )
      }
    }
  }
}

// MARK: - Logo / title

/// Shows the title immediately and swaps in the logo artwork once loaded, so
/// items without a logo image still get a readable heading.
private struct HeroLogoView: View {
  let urlString: String?
  let headers: [String: String]
  let title: String

  @State private var logo: UIImage?

  var body: some View {
    Group {
      if let logo {
        Image(uiImage: logo)
          .resizable()
          .aspectRatio(contentMode: .fit)
          .frame(maxWidth: .infinity, maxHeight: 32, alignment: .leading)
      } else {
        Text(title)
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(.white)
          .lineLimit(1)
      }
    }
    .task(id: urlString) {
      guard let urlString else {
        logo = nil
        return
      }
      let loaded = await HeroImageLoader.shared.load(urlString, headers: headers)
      if !Task.isCancelled {
        logo = loaded
      }
    }
  }
}

// MARK: - Parallax

extension View {
  /// Runs `perform` once the scroll has come fully to rest, so a wrap-around
  /// teleport never interrupts the snap animation.
  ///
  /// iOS 18+ has a real signal (`onScrollPhaseChange` → `.idle`). On iOS 17
  /// there is none, so wait out the snap; `perform` re-checks the live
  /// position, so a second swipe arriving inside the window is harmless.
  // Only reachable from the iOS 17+ carousel; the two-parameter `onChange`
  // below does not exist on the 16.4 deployment target.
  @available(iOS 17.0, *)
  @ViewBuilder
  fileprivate func heroWrapWhenScrollIdle(
    trigger: String?,
    perform: @escaping () -> Void
  ) -> some View {
    if #available(iOS 18.0, *) {
      onScrollPhaseChange { _, newPhase in
        if newPhase == .idle {
          perform()
        }
      }
    } else {
      onChange(of: trigger) { _, _ in
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
          perform()
        }
      }
    }
  }

  /// Pans the view against the scroll direction while its container pages.
  /// No-op below iOS 17 (the fallback TabView has no scroll phase).
  @ViewBuilder
  fileprivate func heroParallax(_ amount: CGFloat) -> some View {
    if #available(iOS 17.0, *) {
      scrollTransition(.interactive, axis: .horizontal) { content, phase in
        content.offset(x: phase.value * amount)
      }
    } else {
      self
    }
  }

  fileprivate func heroBadgeChip() -> some View {
    padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(Color.white.opacity(0.14), in: Capsule())
  }
}

// MARK: - Image loading

/// Header-aware image loader with an in-memory cache. The Jellyfin server can
/// sit behind an auth proxy (Cloudflare Access, Pangolin, ...), so every
/// request carries the custom headers passed down from JS.
final class HeroImageLoader {
  static let shared = HeroImageLoader()

  private let cache = NSCache<NSString, UIImage>()

  private init() {
    cache.totalCostLimit = 64 * 1024 * 1024
  }

  func cached(_ urlString: String) -> UIImage? {
    cache.object(forKey: urlString as NSString)
  }

  func load(_ urlString: String, headers: [String: String]) async -> UIImage? {
    if let hit = cached(urlString) {
      return hit
    }
    guard let url = URL(string: urlString) else {
      return nil
    }
    var request = URLRequest(url: url)
    for (key, value) in headers {
      request.setValue(value, forHTTPHeaderField: key)
    }
    guard
      let (data, response) = try? await URLSession.shared.data(for: request),
      let http = response as? HTTPURLResponse,
      (200..<300).contains(http.statusCode),
      let image = UIImage(data: data)
    else {
      return nil
    }
    // Cost is the decoded footprint, not the compressed download: a backdrop
    // JPEG is an order of magnitude smaller than its bitmap, so charging
    // `data.count` against the limit means eviction would never trigger.
    let cost = image.cgImage.map { $0.bytesPerRow * $0.height } ?? data.count
    cache.setObject(image, forKey: urlString as NSString, cost: cost)
    return image
  }
}

private struct RemoteHeroImage: View {
  let urlString: String?
  let headers: [String: String]

  @State private var image: UIImage?

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color(white: 0.16), Color(white: 0.10)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      if let image {
        Image(uiImage: image)
          .resizable()
          .aspectRatio(contentMode: .fill)
          .transition(.opacity)
      }
    }
    .task(id: urlString) {
      guard let urlString else {
        image = nil
        return
      }
      if let hit = HeroImageLoader.shared.cached(urlString) {
        image = hit
        return
      }
      let loaded = await HeroImageLoader.shared.load(urlString, headers: headers)
      if !Task.isCancelled {
        withAnimation(.easeIn(duration: 0.25)) {
          image = loaded
        }
      }
    }
  }
}

#endif
