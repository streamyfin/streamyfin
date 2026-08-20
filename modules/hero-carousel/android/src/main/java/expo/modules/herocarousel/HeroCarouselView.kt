package expo.modules.herocarousel

import android.annotation.SuppressLint
import android.content.Context
import android.view.MotionEvent
import android.view.ViewConfiguration
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs

/**
 * Android half of the `HeroCarousel` view, hosting the Compose carousel in
 * the React Native view tree.
 *
 * Deliberately a plain [ExpoView] with its own [ComposeView] rather than
 * expo-modules-core's `ExpoComposeView`: registering one of those goes
 * through `toPropsParsingStrategy`, whose `isIntrospectable` /
 * `introspectionOf` calls are Pika compiler-plugin intrinsics. That plugin is
 * not applied to modules built inside this app — `@expo/ui` gets away with it
 * because it ships as a prebuilt AAR — so the reified marker survives into the
 * bytecode and the module throws `UnsupportedOperationException: This function
 * has a reified type parameter...` the moment it is registered, taking the
 * whole app down at startup. Hosting Compose by hand costs the lifecycle
 * wiring below and nothing else; the props machinery was unused anyway, since
 * everything arrives as one JSON string.
 */
@SuppressLint("ViewConstructor")
class HeroCarouselExpoView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {

  private val payload = mutableStateOf(HeroPayload.EMPTY)

  private val onItemPress by EventDispatcher()
  private val onFilterToggle by EventDispatcher()

  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var downX = 0f
  private var downY = 0f

  private val composeView = ComposeView(context).also { view ->
    view.id = generateViewId()
    view.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    // Pin the composition to the Activity, not to this view's tree owner.
    // react-native-screens destroys the screen fragment's lifecycle on every
    // tab switch, and Compose self-disposes on its ON_DESTROY — leaving a
    // dead composition that never recreates, i.e. a blank hero after the
    // first switch away from Home. Overriding the owners on the ComposeView
    // (nearest tag wins) points both at the Activity instead.
    val activity = appContext.currentActivity
    if (activity is LifecycleOwner && activity is SavedStateRegistryOwner) {
      view.setViewTreeLifecycleOwner(activity)
      view.setViewTreeSavedStateRegistryOwner(activity)
      view.setViewCompositionStrategy(
        ViewCompositionStrategy.DisposeOnLifecycleDestroyed(activity.lifecycle)
      )
    } else {
      view.setViewCompositionStrategy(
        ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed
      )
    }
    view.setContent {
      HeroCarouselRoot(
        payload = payload.value,
        onItemPress = { id -> onItemPress(mapOf("id" to id)) },
        onFilterToggle = { key -> onFilterToggle(mapOf("key" to key)) }
      )
    }
  }

  // React Native does not re-layout a native view when it calls
  // `requestLayout` itself, which Compose does whenever its content resizes,
  // so the relayout has to be posted by hand. `shouldUseAndroidLayout = true`
  // is expo-modules-core's version of exactly that, but it posts the
  // runnable unconditionally: Compose calls `requestLayout` on its way down
  // too, so passes stay queued for a view React Native has already dropped,
  // and a burst of them within one frame measures the whole Compose tree
  // once per call. Owning the post keeps that to one pass per frame and
  // drops it once the view is gone.
  //
  // Dropping a pass costs nothing: this view's bounds come from Yoga and
  // cannot change while React Native is not laying it out, and Compose
  // re-runs its own measure and layout from `dispatchDraw` when it is next
  // drawn. What keeps a stray pass from being fatal is `onMeasure` below.
  override val shouldUseAndroidLayout = false

  private var disposed = false
  private var relayoutPending = false

  override fun requestLayout() {
    super.requestLayout()
    if (relayoutPending) {
      return
    }
    relayoutPending = true
    post {
      // Cleared first, so a `requestLayout` that the pass itself provokes
      // schedules the next one rather than being swallowed.
      relayoutPending = false
      if (!disposed && isAttachedToWindow) {
        measureAndLayout()
      }
    }
  }

  /**
   * Measures to the size React Native asked for without touching the Compose
   * subtree while this view has no window.
   *
   * React Native measures every mounted view with the exact size Yoga gave
   * it (`SurfaceMountingManager.updateLayout`), attached to a window or not.
   * That is fatal for a ComposeView: `AbstractComposeView.onMeasure` creates
   * the composition on first measure, and creating one has to find the
   * window recomposer. Switching the hero back on from the appearance
   * settings mounts it into the Home screen while react-native-screens has
   * that screen detached behind the settings screen, so the measure lands
   * with no window and throws `IllegalStateException: Cannot locate
   * windowRecomposer`. The same throw ends a pass that arrives after the
   * view has already been dropped.
   *
   * React Native's comment on that call allows exactly this: a view may stub
   * `onMeasure` out to nothing more than `setMeasuredDimension`. Skipping it
   * costs nothing, since `AbstractComposeView` also creates its composition
   * from `onAttachedToWindow` and lays out once it has. ComposeView is final
   * and so is its `onMeasure`, so the guard sits here and keeps the measure
   * from reaching the child at all.
   */
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    if (!isAttachedToWindow) {
      setMeasuredDimension(
        getDefaultSize(suggestedMinimumWidth, widthMeasureSpec),
        getDefaultSize(suggestedMinimumHeight, heightMeasureSpec)
      )
      return
    }
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
  }

  init {
    // Card shadows and the scaled neighbour cards draw outside our bounds.
    clipChildren = false
    clipToPadding = false
    addView(composeView)
  }

  /**
   * A failed parse leaves the previous payload in place rather than blanking
   * the carousel, matching `setPayload` on iOS.
   */
  fun setPayload(json: String) {
    val parsed = HeroPayload.parse(json) ?: return
    if (parsed != payload.value) {
      payload.value = parsed
    }
  }

  /**
   * The composition outlives window detachment on purpose (see above), so it
   * has to be torn down explicitly when React Native drops the view —
   * otherwise the Activity's lifecycle observer keeps this view alive.
   */
  fun dispose() {
    disposed = true
    composeView.setViewCompositionStrategy(
      ViewCompositionStrategy.DisposeOnDetachedFromWindow
    )
    composeView.disposeComposition()
  }

  /**
   * The hero lives inside React Native's vertical ScrollView, which claims a
   * gesture as soon as it crosses the slop vertically — a diagonal swipe can
   * therefore be stolen mid-page. Claiming the gesture the moment it reads as
   * horizontal keeps paging intact while leaving vertical scrolling alone.
   * Same idea as ViewPager2's `NestedScrollableHost`.
   *
   * The disallow flag is cleared by the framework on the next ACTION_DOWN, so
   * there is nothing to undo here.
   */
  override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = ev.x
        downY = ev.y
      }

      MotionEvent.ACTION_MOVE -> {
        val dx = abs(ev.x - downX)
        val dy = abs(ev.y - downY)
        if (dx > touchSlop && dx > dy) {
          parent?.requestDisallowInterceptTouchEvent(true)
        }
      }
    }
    return super.onInterceptTouchEvent(ev)
  }
}
