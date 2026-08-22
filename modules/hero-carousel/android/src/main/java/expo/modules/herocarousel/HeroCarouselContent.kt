package expo.modules.herocarousel

import android.graphics.Bitmap
import android.os.Build
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.util.lerp
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.abs

/**
 * Jetpack Compose twin of `HeroCarouselView.swift`. Same payload, same
 * geometry, same card design; the paging mechanics differ where the platform
 * offers something better (see [HeroPager]).
 */

private object HeroLayout {
  /** Horizontal inset of the snapped card. Neighbors peek through it. */
  val PageMargin = 36.dp
  val CardSpacing = 12.dp
  val CardCorner = 28.dp
  val PanelCorner = 20.dp
  val CardPadding = 12.dp
  /** Extra backdrop width on each side, consumed by the parallax pan. */
  val Parallax = 36.dp
  /** Vertical space reserved under the cards for the page dots. */
  val DotsArea = 24.dp
  val CardElevation = 12.dp
  val PanelBlur = 24.dp
}

/**
 * `Modifier.blur` is a no-op below Android 12, so the glass panel falls back
 * to a heavier flat tint there instead of drawing an unblurred copy of the
 * backdrop behind its own text.
 */
private val BlurSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

private val PlaceholderBrush = Brush.linearGradient(
  listOf(Color(0xFF292929), Color(0xFF1A1A1A))
)

/** Scrim so the glass panel and label stay legible on bright art. */
private val CardScrimBrush = Brush.verticalGradient(
  0f to Color.Black.copy(alpha = 0.25f),
  0.3f to Color.Transparent,
  0.45f to Color.Transparent,
  1f to Color.Black.copy(alpha = 0.65f)
)

private val PanelSheenBrush = Brush.verticalGradient(
  listOf(Color.White.copy(alpha = 0.10f), Color.White.copy(alpha = 0.04f))
)

/** iOS `.destructive` red, so both platforms flag the same row the same way. */
private val DestructiveColor = Color(0xFFFF453A)

private val TextPrimary = Color.White
private val TextSecondary = Color.White.copy(alpha = 0.9f)
private val TextTertiary = Color.White.copy(alpha = 0.75f)
private val HairlineColor = Color.White.copy(alpha = 0.15f)

// MARK: - Root

@Composable
internal fun HeroCarouselRoot(
  payload: HeroPayload,
  onItemPress: (String) -> Unit,
  onFilterToggle: (String) -> Unit
) {
  // The app is dark themed; force a dark scheme so the filter menu renders
  // dark regardless of the system setting (iOS forces `colorScheme` too).
  MaterialTheme(colorScheme = HeroColorScheme) {
    Box(Modifier.fillMaxSize()) {
      if (payload.items.isEmpty()) {
        // Loading / no-data placeholder: a faint card skeleton where the
        // hero will appear.
        HeroSkeleton()
      } else {
        HeroPager(
          items = payload.items,
          headers = payload.imageHeaders,
          onItemPress = onItemPress
        )
      }

      // Overlaid here rather than inside a card for two reasons: neighbour
      // cards peek in at the edges, so a per-card button would show a second
      // half-clipped copy in the slivers; and filtering down to zero items
      // must not strand the user without a way to undo it, so the button has
      // to outlive the carousel and sit over the empty-state skeleton too.
      if (payload.filterSections.isNotEmpty()) {
        HeroFilterMenu(
          sections = payload.filterSections,
          label = payload.filterLabel,
          onToggle = onFilterToggle,
          modifier = Modifier
            .align(Alignment.TopEnd)
            .padding(top = 12.dp, end = HeroLayout.PageMargin + 12.dp)
        )
      }
    }
  }
}

private val HeroColorScheme = darkColorScheme(
  surface = Color(0xFF1C1C1E),
  surfaceContainer = Color(0xFF1C1C1E),
  onSurface = Color.White,
  onSurfaceVariant = Color.White.copy(alpha = 0.7f)
)

// MARK: - Pager

/**
 * Wrap-around paging without the sentinel-clone dance the SwiftUI side needs:
 * a pager over `Int.MAX_VALUE` pages that indexes items modulo their count
 * starts in the middle and can be swiped either way forever, so there is no
 * teleport to hide and no scroll-idle phase to wait for.
 */
@Composable
private fun HeroPager(
  items: List<HeroItem>,
  headers: Map<String, String>,
  onItemPress: (String) -> Unit
) {
  val count = items.size
  val pagerState = rememberPagerState(initialPage = infiniteStartPage(count)) {
    if (count > 1) Int.MAX_VALUE else count
  }
  // Data changed under us (e.g. pull-to-refresh dropped a slide): the page
  // index means a different item now, so go back to the start. Same count is
  // left alone — a refresh that returns the same slides keeps the position.
  LaunchedEffect(count) { pagerState.scrollToPage(infiniteStartPage(count)) }

  val scope = rememberCoroutineScope()
  var scrollJob by remember { mutableStateOf<Job?>(null) }

  Column(Modifier.fillMaxSize()) {
    HorizontalPager(
      state = pagerState,
      modifier = Modifier
        .fillMaxWidth()
        .weight(1f),
      // Insets the pages so the snapped card sits centered with a neighbor
      // sliver on each side, matching iOS `contentMargins`.
      contentPadding = PaddingValues(horizontal = HeroLayout.PageMargin),
      pageSpacing = HeroLayout.CardSpacing,
      beyondViewportPageCount = 1,
      key = { page -> page }
    ) { page ->
      val item = items[Math.floorMod(page, count)]
      BoxWithConstraints(Modifier.fillMaxSize()) {
        HeroCard(
          item = item,
          headers = headers,
          cardWidth = maxWidth,
          cardHeight = maxHeight,
          // A lambda, not a value: read inside the draw phase so a swipe
          // re-runs the layer instead of recomposing three cards per frame.
          pageOffset = { pagerState.offsetForPage(page) },
          onPress = { onItemPress(item.id) }
        )
      }
    }

    if (count > 1) {
      val activeIndex = Math.floorMod(pagerState.currentPage, count)
      HeroPageDots(
        count = count,
        activeIndex = activeIndex,
        modifier = Modifier
          .fillMaxWidth()
          .height(HeroLayout.DotsArea)
      ) { index ->
        // Scrubbing fires selections faster than a page animation settles;
        // the previous fly-through is dropped rather than queued.
        scrollJob?.cancel()
        scrollJob = scope.launch {
          pagerState.animateScrollToPage(nearestPage(pagerState.currentPage, index, count))
        }
      }
    }
  }
}

private fun infiniteStartPage(count: Int): Int =
  if (count > 1) (Int.MAX_VALUE / 2) - (Int.MAX_VALUE / 2) % count else 0

/** The page carrying [index] that is fewest swipes away in either direction. */
private fun nearestPage(currentPage: Int, index: Int, count: Int): Int {
  val forward = Math.floorMod(index - Math.floorMod(currentPage, count), count)
  val delta = if (forward > count / 2) forward - count else forward
  return currentPage + delta
}

/**
 * How far [page] sits from the settled position, in pages: 0 when snapped,
 * +1 one page to the right, -1 one page to the left. Matches the sign of
 * SwiftUI's `ScrollTransitionPhase.value` so both platforms pan the backdrop
 * the same way.
 */
private fun PagerState.offsetForPage(page: Int): Float =
  ((currentPage - page) + currentPageOffsetFraction) * -1f

// MARK: - Card

@Composable
private fun HeroCard(
  item: HeroItem,
  headers: Map<String, String>,
  cardWidth: Dp,
  cardHeight: Dp,
  pageOffset: () -> Float,
  onPress: () -> Unit
) {
  val shape = RoundedCornerShape(HeroLayout.CardCorner)
  val interactionSource = remember { MutableInteractionSource() }
  val pressed by interactionSource.collectIsPressedAsState()
  val pressScale = animateFloatAsState(
    targetValue = if (pressed) 0.97f else 1f,
    animationSpec = spring(dampingRatio = 0.7f, stiffness = 400f),
    label = "heroCardPress"
  )
  val parallaxPx = with(LocalDensity.current) { HeroLayout.Parallax.toPx() }
  val backdrop = rememberHeroImage(item.backdropUrl, headers)

  Box(
    Modifier
      .fillMaxSize()
      .graphicsLayer {
        val offset = pageOffset().coerceIn(-1f, 1f)
        val scale = lerp(0.95f, 1f, 1f - abs(offset)) * pressScale.value
        scaleX = scale
        scaleY = scale
      }
      .shadow(HeroLayout.CardElevation, shape, clip = false)
      .clip(shape)
      .border(1.dp, Color.White.copy(alpha = 0.12f), shape)
      .clickable(
        interactionSource = interactionSource,
        indication = null,
        onClick = onPress
      )
  ) {
    HeroBackdrop(
      image = backdrop,
      cardWidth = cardWidth,
      cardHeight = cardHeight,
      parallaxPx = parallaxPx,
      pageOffset = pageOffset
    )
    Box(Modifier.matchParentSize().background(CardScrimBrush))

    Column(Modifier.fillMaxSize().padding(HeroLayout.CardPadding)) {
      val label = item.label
      if (!label.isNullOrEmpty()) {
        HeroLabelChip(label, item.labelIcon)
      }
      Spacer(Modifier.weight(1f))
      HeroInfoPanel(
        item = item,
        headers = headers,
        backdrop = backdrop,
        cardWidth = cardWidth,
        cardHeight = cardHeight,
        parallaxPx = parallaxPx,
        pageOffset = pageOffset
      )
    }
  }
}

/**
 * The card art, drawn wider than the card so the parallax pan never exposes
 * an edge. Also used — offset and blurred — as the material behind the info
 * panel, which is why it takes the card's geometry rather than filling its
 * parent.
 */
@Composable
private fun HeroBackdrop(
  image: ImageBitmap?,
  cardWidth: Dp,
  cardHeight: Dp,
  parallaxPx: Float,
  pageOffset: () -> Float,
  modifier: Modifier = Modifier
) {
  val fade = animateFloatAsState(
    targetValue = if (image != null) 1f else 0f,
    animationSpec = tween(durationMillis = 250),
    label = "heroBackdropFade"
  )
  Box(
    modifier
      .requiredSize(cardWidth, cardHeight)
      .clipToBounds()
      .background(PlaceholderBrush),
    contentAlignment = Alignment.Center
  ) {
    if (image != null) {
      Image(
        bitmap = image,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = Modifier
          // `requiredWidth`, not `width`: the overflow is the point, and a
          // plain width would be coerced back to the card's bounds.
          .requiredWidth(cardWidth + HeroLayout.Parallax * 2)
          .fillMaxHeight()
          .graphicsLayer {
            translationX = pageOffset().coerceIn(-1f, 1f) * parallaxPx
            alpha = fade.value
          }
      )
    }
  }
}

@Composable
private fun HeroLabelChip(label: String, iconName: String?) {
  val icon = sfSymbolIcon(iconName)
  Row(
    modifier = Modifier
      .clip(CircleShape)
      .background(Color.Black.copy(alpha = 0.42f))
      .border(0.5.dp, HairlineColor, CircleShape)
      .padding(horizontal = 10.dp, vertical = 6.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(4.dp)
  ) {
    if (icon != null) {
      Icon(
        imageVector = icon,
        contentDescription = null,
        tint = Color.White.copy(alpha = 0.95f),
        modifier = Modifier.size(11.dp)
      )
    }
    Text(
      text = label.uppercase(),
      color = Color.White.copy(alpha = 0.95f),
      fontSize = 10.sp,
      fontWeight = FontWeight.Black,
      letterSpacing = 0.8.sp,
      maxLines = 1
    )
  }
}

/**
 * The SF Symbol names JS sends are the payload's one iOS-shaped field. Rather
 * than teach JS about two icon sets, the mapping to Material icons lives here.
 */
private fun sfSymbolIcon(name: String?): ImageVector? = when (name) {
  "play.fill" -> Icons.Filled.PlayArrow
  "forward.fill" -> Icons.Filled.FastForward
  "sparkles" -> Icons.Filled.AutoAwesome
  else -> null
}

// MARK: - Info panel

@Composable
private fun HeroInfoPanel(
  item: HeroItem,
  headers: Map<String, String>,
  backdrop: ImageBitmap?,
  cardWidth: Dp,
  cardHeight: Dp,
  parallaxPx: Float,
  pageOffset: () -> Float
) {
  val shape = RoundedCornerShape(HeroLayout.PanelCorner)
  Box(
    Modifier
      .fillMaxWidth()
      .clip(shape)
      .border(1.dp, Color.White.copy(alpha = 0.1f), shape)
  ) {
    if (BlurSupported) {
      // SwiftUI's `.ultraThinMaterial` samples whatever is behind it; Compose
      // has no such material, so the panel re-draws the card art blurred.
      // The wrapper takes the panel's size (`matchParentSize` keeps it out of
      // the measure pass) and the copy is pinned by the card's bottom-left
      // corner — 12dp out and 12dp down from the panel's — so the blur lines
      // up with the art it is standing on, parallax included.
      Box(Modifier.matchParentSize()) {
        HeroBackdrop(
          image = backdrop,
          cardWidth = cardWidth,
          cardHeight = cardHeight,
          parallaxPx = parallaxPx,
          pageOffset = pageOffset,
          modifier = Modifier
            .align(Alignment.BottomStart)
            .offset(x = -HeroLayout.CardPadding, y = HeroLayout.CardPadding)
            .blur(HeroLayout.PanelBlur, BlurredEdgeTreatment.Unbounded)
        )
      }
    }
    Box(
      Modifier
        .matchParentSize()
        .background(Color.Black.copy(alpha = if (BlurSupported) 0.38f else 0.62f))
    )
    Box(Modifier.matchParentSize().background(PanelSheenBrush))

    Column(
      modifier = Modifier.padding(HeroLayout.CardPadding),
      verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
      ) {
        if (!item.posterUrl.isNullOrEmpty()) {
          val poster = rememberHeroImage(item.posterUrl, headers)
          val posterShape = RoundedCornerShape(10.dp)
          Box(
            Modifier
              .size(62.dp, 93.dp)
              .clip(posterShape)
              .background(PlaceholderBrush)
              .border(0.5.dp, HairlineColor, posterShape)
          ) {
            if (poster != null) {
              Image(
                bitmap = poster,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
              )
            }
          }
        }

        Column(
          modifier = Modifier.weight(1f),
          verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
          HeroLogo(item.logoUrl, headers, item.title)

          val subtitle = item.subtitle
          if (!subtitle.isNullOrEmpty()) {
            Text(
              text = subtitle,
              color = TextSecondary,
              fontSize = 12.sp,
              fontWeight = FontWeight.SemiBold,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
          }

          if (item.overview.isNotEmpty()) {
            Text(
              text = item.overview,
              color = TextTertiary,
              fontSize = 12.sp,
              lineHeight = 16.sp,
              maxLines = 2,
              overflow = TextOverflow.Ellipsis
            )
          }
        }
      }

      // Full panel width so the chips never get squeezed by the poster column.
      HeroBadges(item)

      val progress = item.progress
      if (progress != null && progress > 0.01f) {
        HeroProgressBar(progress)
      }
    }
  }
}

/**
 * Shows the title immediately and swaps in the logo artwork once loaded, so
 * items without a logo image still get a readable heading.
 */
@Composable
private fun HeroLogo(url: String?, headers: Map<String, String>, title: String) {
  val logo = rememberHeroImage(url, headers)
  if (logo != null) {
    Image(
      bitmap = logo,
      contentDescription = title,
      contentScale = ContentScale.Fit,
      alignment = Alignment.CenterStart,
      modifier = Modifier
        .fillMaxWidth()
        .height(32.dp)
    )
  } else {
    Text(
      text = title,
      color = TextPrimary,
      fontSize = 17.sp,
      fontWeight = FontWeight.Bold,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis
    )
  }
}

@Composable
private fun HeroBadges(item: HeroItem) {
  if (item.communityRating == null && item.badges.isEmpty()) return
  Row(
    // Chips render at full size and the rare overflow clips at the panel edge
    // instead of every chip degrading into "...".
    modifier = Modifier
      .fillMaxWidth()
      .clipToBounds()
      .wrapContentWidth(Alignment.Start, unbounded = true),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(6.dp)
  ) {
    item.communityRating?.let { rating ->
      HeroBadgeChip {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(3.dp)
        ) {
          Icon(
            imageVector = Icons.Filled.Star,
            contentDescription = null,
            tint = Color(0xFFFFD60A),
            modifier = Modifier.size(10.dp)
          )
          Text(
            text = String.format(Locale.getDefault(), "%.1f", rating),
            color = TextSecondary,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
          )
        }
      }
    }
    for (badge in item.badges) {
      HeroBadgeChip {
        Text(
          text = badge,
          color = TextSecondary,
          fontSize = 11.sp,
          fontWeight = FontWeight.SemiBold,
          maxLines = 1,
          softWrap = false
        )
      }
    }
  }
}

@Composable
private fun HeroBadgeChip(content: @Composable () -> Unit) {
  Box(
    modifier = Modifier
      .clip(CircleShape)
      .background(Color.White.copy(alpha = 0.14f))
      .padding(horizontal = 8.dp, vertical = 4.dp)
  ) {
    content()
  }
}

@Composable
private fun HeroProgressBar(progress: Float) {
  Box(
    Modifier
      .fillMaxWidth()
      .height(3.dp)
      .clip(CircleShape)
      .background(Color.White.copy(alpha = 0.2f))
  ) {
    Box(
      Modifier
        .fillMaxWidth(progress.coerceIn(0f, 1f))
        .widthIn(min = 4.dp)
        .fillMaxHeight()
        .clip(CircleShape)
        .background(Color.White.copy(alpha = 0.9f))
    )
  }
}

// MARK: - Page dots

/**
 * Tappable and scrubbable: touching down jumps to the nearest dot's page,
 * dragging across the strip flies through the carousel.
 */
@Composable
private fun HeroPageDots(
  count: Int,
  activeIndex: Int,
  modifier: Modifier = Modifier,
  onSelect: (Int) -> Unit
) {
  val haptics = LocalHapticFeedback.current
  // Read through a holder rather than capturing: keying the gesture detector
  // on the active index would tear down a scrub in progress every time the
  // page it selects lands.
  val currentActiveIndex = rememberUpdatedState(activeIndex)

  Box(modifier, contentAlignment = Alignment.Center) {
    Row(
      modifier = Modifier
        .fillMaxHeight()
        .padding(horizontal = 12.dp)
        .pointerInput(count) {
          awaitEachGesture {
            var lastIndex = currentActiveIndex.value
            val step = size.width / count.toFloat()

            fun selectAt(x: Float) {
              if (step <= 0f) return
              val index = (x / step).toInt().coerceIn(0, count - 1)
              if (index != lastIndex) {
                lastIndex = index
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onSelect(index)
              }
            }

            // Not consumed: the RN scroll view wrapping the hero still wins
            // vertical pans that start on the dots.
            val down = awaitFirstDown(requireUnconsumed = false)
            selectAt(down.position.x)
            do {
              val event = awaitPointerEvent()
              for (change in event.changes) {
                if (change.pressed) {
                  selectAt(change.position.x)
                }
              }
            } while (event.changes.any { it.pressed })
          }
        },
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally)
    ) {
      repeat(count) { index ->
        val active = index == activeIndex
        val width by animateDpAsState(
          targetValue = if (active) 18.dp else 6.dp,
          animationSpec = spring(dampingRatio = 0.8f, stiffness = 350f),
          label = "heroDotWidth"
        )
        val alpha by animateFloatAsState(
          targetValue = if (active) 0.9f else 0.3f,
          animationSpec = spring(dampingRatio = 0.8f, stiffness = 350f),
          label = "heroDotAlpha"
        )
        Box(
          Modifier
            .width(width)
            .height(6.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = alpha))
        )
      }
    }
  }
}

// MARK: - Filter menu

/**
 * Glass button in the card's top-right corner, mirroring the label chip on
 * the left. Opens a dropdown whose rows carry a checkmark when enabled, which
 * is how the SwiftUI `Toggle` rows read on iOS.
 */
@Composable
private fun HeroFilterMenu(
  sections: List<HeroFilterSection>,
  label: String,
  onToggle: (String) -> Unit,
  modifier: Modifier = Modifier
) {
  var expanded by remember { mutableStateOf(false) }

  Box(modifier) {
    Box(
      modifier = Modifier
        .size(32.dp)
        .clip(CircleShape)
        .background(Color.Black.copy(alpha = 0.45f))
        .border(0.5.dp, HairlineColor, CircleShape)
        .clickable { expanded = true },
      contentAlignment = Alignment.Center
    ) {
      Icon(
        imageVector = Icons.Filled.FilterList,
        contentDescription = label.takeIf { it.isNotEmpty() },
        tint = Color.White.copy(alpha = 0.95f),
        modifier = Modifier.size(17.dp)
      )
    }

    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
      sections.forEachIndexed { sectionIndex, section ->
        if (sectionIndex > 0) {
          HorizontalDivider(color = Color.White.copy(alpha = 0.12f))
        }
        val title = section.title
        if (!title.isNullOrEmpty()) {
          Text(
            text = title,
            color = Color.White.copy(alpha = 0.6f),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
          )
        }
        for (option in section.options) {
          DropdownMenuItem(
            text = {
              Text(
                text = option.label,
                color = if (option.destructive) DestructiveColor else Color.White
              )
            },
            trailingIcon = {
              // A destructive row is a one-way action, not a filter: it is
              // only ever reachable while the thing it turns off is on, so a
              // checkmark would say nothing.
              if (!option.destructive && option.enabled) {
                Icon(
                  imageVector = Icons.Filled.Check,
                  contentDescription = null,
                  tint = Color.White
                )
              }
            },
            onClick = {
              expanded = false
              // The caller owns the state; this only reports the intent.
              onToggle(option.key)
            }
          )
        }
      }
    }
  }
}

// MARK: - Skeleton

@Composable
private fun HeroSkeleton() {
  val shape = RoundedCornerShape(HeroLayout.CardCorner)
  Column(Modifier.fillMaxSize()) {
    Box(
      Modifier
        .fillMaxWidth()
        .weight(1f)
        .padding(horizontal = HeroLayout.PageMargin)
        .clip(shape)
        .background(Color.White.copy(alpha = 0.06f))
        .border(1.dp, Color.White.copy(alpha = 0.08f), shape)
    )
    Spacer(Modifier.height(HeroLayout.DotsArea))
  }
}

// MARK: - Images

/**
 * Resolves [url] to a bitmap, serving the cache synchronously so a card that
 * pages back into view doesn't fade in again.
 */
@Composable
private fun rememberHeroImage(url: String?, headers: Map<String, String>): ImageBitmap? {
  var bitmap by remember(url) {
    mutableStateOf(url?.takeIf { it.isNotEmpty() }?.let(HeroImageLoader::cached))
  }
  LaunchedEffect(url, headers) {
    if (bitmap == null && !url.isNullOrEmpty()) {
      bitmap = HeroImageLoader.load(url, headers)
    }
  }
  return rememberImageBitmap(bitmap)
}

@Composable
private fun rememberImageBitmap(bitmap: Bitmap?): ImageBitmap? =
  remember(bitmap) { bitmap?.asImageBitmap() }
