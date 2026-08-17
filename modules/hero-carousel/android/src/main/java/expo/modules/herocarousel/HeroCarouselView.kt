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
  // `requestLayout` itself, which Compose does whenever its content resizes.
  override val shouldUseAndroidLayout = true

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
