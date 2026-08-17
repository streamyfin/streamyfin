import SwiftUI
import UIKit

/// Entry point hosted by the grid's ExpoView. The whole scrollable grid is one
/// native view; whatever JS pins above it stays in JS.
struct GlassCardGridRootView: View {
  @ObservedObject var state: GlassCardGridState
  let onItemPress: (String, Int) -> Void
  let onItemLongPress: (String, Int) -> Void
  let onEndReached: () -> Void

  var body: some View {
    #if os(iOS)
    GlassCardGrid(
      items: state.items,
      headers: state.imageHeaders,
      layout: state.layout,
      columns: state.columns,
      loadingMore: state.loadingMore,
      contentInsetTop: state.contentInsetTop,
      contentInsetBottom: state.contentInsetBottom,
      scrollToTopToken: state.scrollToTopToken,
      onItemPress: onItemPress,
      onItemLongPress: onItemLongPress,
      onEndReached: onEndReached
    )
    .environment(\.colorScheme, .dark)
    #else
    EmptyView()
    #endif
  }
}

#if os(iOS)

private struct GlassCardGrid: View {
  let items: [GlassCardItem]
  let headers: [String: String]
  let layout: GlassCardLayout
  let columns: Int
  let loadingMore: Bool
  let contentInsetTop: Double
  let contentInsetBottom: Double
  let scrollToTopToken: String?
  let onItemPress: (String, Int) -> Void
  let onItemLongPress: (String, Int) -> Void
  let onEndReached: () -> Void

  /// Anchor for scroll-to-top; the first card's id would disappear with it
  /// when the filtered list changes.
  private let topAnchorId = "glass-card-grid-top"

  private var gridColumns: [GridItem] {
    Array(
      repeating: GridItem(.fixed(layout.cardWidth), spacing: layout.spacing),
      count: max(columns, 1)
    )
  }

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView(.vertical, showsIndicators: true) {
        // The anchor sits outside the grid: inside, it would be laid out as a
        // grid item and eat the first cell.
        Color.clear
          .frame(height: 0)
          .id(topAnchorId)

        LazyVGrid(columns: gridColumns, spacing: layout.spacing) {
          ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
            GlassCardView(
              item: item,
              headers: headers,
              layout: layout,
              onPress: { onItemPress(item.id, index) },
              onLongPress: { onItemLongPress(item.id, index) }
            )
            // Same tail-driven paging as the row: the cells are lazy, so the
            // last few appearing is exactly "scrolled to the end". JS ignores
            // the event while a page is in flight.
            .onAppear {
              if index >= items.count - columns * 2 {
                onEndReached()
              }
            }
          }
        }
        .padding(.horizontal, layout.contentInset)
        .padding(.top, contentInsetTop)
        .padding(.bottom, contentInsetBottom)

        if loadingMore {
          ProgressView()
            .padding(.bottom, contentInsetBottom + 16)
        }
      }
      .onChange(of: scrollToTopToken) { _ in
        DispatchQueue.main.async {
          proxy.scrollTo(topAnchorId, anchor: .top)
        }
      }
    }
  }
}

#endif
