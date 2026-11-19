package expo.modules.herocarousel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HeroFontScaleTest {
  @Test
  fun aSystemScaleUnderTheCapIsKept() {
    assertEquals(1.15f, cardFontScale(1.15f, 1.3f), 0f)
  }

  @Test
  fun aSystemScaleOverTheCapStopsAtIt() {
    assertEquals(1.3f, cardFontScale(2.0f, 1.3f), 0f)
  }

  @Test
  fun withoutACapTheCardsFollowTheSystem() {
    assertEquals(2.0f, cardFontScale(2.0f, null), 0f)
  }

  @Test
  fun thePayloadCarriesTheCap() {
    assertEquals(1.3f, HeroPayload.parse("""{"items":[],"maxFontScale":1.3}""")!!.maxFontScale!!, 0f)
  }

  @Test
  fun aNullCapLeavesTheCardsOnTheSystemScale() {
    assertNull(HeroPayload.parse("""{"items":[],"maxFontScale":null}""")!!.maxFontScale)
  }

  // A payload from a build that predates the cap.
  @Test
  fun aMissingCapLeavesTheCardsOnTheSystemScale() {
    assertNull(HeroPayload.parse("""{"items":[]}""")!!.maxFontScale)
  }

  // A cap of zero would draw the cards' text at no size at all.
  @Test
  fun aCapThatIsNotPositiveIsIgnored() {
    assertNull(HeroPayload.parse("""{"items":[],"maxFontScale":0}""")!!.maxFontScale)
    assertNull(HeroPayload.parse("""{"items":[],"maxFontScale":-1}""")!!.maxFontScale)
  }
}
