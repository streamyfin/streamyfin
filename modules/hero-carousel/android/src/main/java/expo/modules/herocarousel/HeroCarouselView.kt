package expo.modules.herocarousel

import android.annotation.SuppressLint
import android.content.Context
import android.view.MotionEvent
import android.view.ViewConfiguration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ComposableScope
import expo.modules.kotlin.views.ComposeProps
import expo.modules.kotlin.views.ExpoComposeView
import kotlin.math.abs

class HeroCarouselProps(
  val payload: MutableState<HeroPayload> = mutableStateOf(HeroPayload.EMPTY)
) : ComposeProps

/**
 * Android half of the `HeroCarousel` view, hosting the Compose carousel in
 * the React Native view tree.
 *
 * `withHostingView = true` is what makes this a Compose root rather than a
 * child of an `@expo/ui` `<Host>`: expo-modules-core then adds the
 * `ComposeView` itself and pins its composition to the Activity lifecycle,
 * which is what keeps the carousel from going blank when react-native-screens
 * detaches the home tab on a tab switch.
 */
@SuppressLint("ViewConstructor")
class HeroCarouselExpoView(context: Context, appContext: AppContext) :
  ExpoComposeView<HeroCarouselProps>(context, appContext, withHostingView = true) {

  override val props = HeroCarouselProps()

  private val onItemPress by EventDispatcher()
  private val onFilterToggle by EventDispatcher()

  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var downX = 0f
  private var downY = 0f

  @Composable
  override fun ComposableScope.Content() {
    HeroCarouselRoot(
      payload = props.payload.value,
      onItemPress = { id -> onItemPress(mapOf("id" to id)) },
      onFilterToggle = { key -> onFilterToggle(mapOf("key" to key)) }
    )
  }

  /**
   * A failed parse leaves the previous payload in place rather than blanking
   * the carousel, matching `setPayload` on iOS.
   */
  fun setPayload(payload: String) {
    val parsed = HeroPayload.parse(payload) ?: return
    if (parsed != props.payload.value) {
      props.payload.value = parsed
    }
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
