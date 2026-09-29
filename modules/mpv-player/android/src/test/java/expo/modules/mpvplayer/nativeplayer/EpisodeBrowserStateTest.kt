package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class EpisodeBrowserStateTest {
    private fun episode(
        id: String,
        season: String,
        name: String = season,
        current: Boolean = false
    ) = EpisodeListItemRecord().apply {
        itemId = id
        seasonKey = season
        seasonName = name
        isCurrent = current
    }

    private val episodes = listOf(
        episode("special", "number:0", "Specials"),
        episode("s1e1", "number:1", "Season One", current = true),
        episode("s1e2", "number:1", "Season One"),
        episode("s2e1", "number:2", "Season Two")
    )

    @Test
    fun groupsByDisplayKeyInListOrderAndDefaultsToCurrentEpisode() {
        val state = EpisodeBrowserState().update(episodes, null)

        assertEquals(
            listOf(
                EpisodeSeason("number:0", "Specials"),
                EpisodeSeason("number:1", "Season One"),
                EpisodeSeason("number:2", "Season Two")
            ),
            state.seasons
        )
        assertEquals("number:1", state.selectedSeasonKey)
        assertEquals(listOf("s1e1", "s1e2"), state.visibleEpisodes.map { it.itemId })
    }

    @Test
    fun metadataIdentifiesCurrentEpisodeBeforeCurrentFlagsRefresh() {
        val state = EpisodeBrowserState().update(episodes, "s2e1")

        assertEquals("number:2", state.selectedSeasonKey)
    }

    @Test
    fun defaultsToFirstSeasonWhenNoEpisodeIsCurrent() {
        val state = EpisodeBrowserState().update(episodes.filterNot { it.isCurrent }, null)

        assertEquals("number:0", state.selectedSeasonKey)
    }

    @Test
    fun selectingSeasonOnlyFiltersBrowsingAndRetainsFullTransportList() {
        val state = EpisodeBrowserState().update(episodes, "s1e1").selectSeason("number:2")

        assertEquals(listOf("s2e1"), state.visibleEpisodes.map { it.itemId })
        assertSame(episodes, state.episodes)
        assertEquals("s1e1", state.playingItemId)
        assertEquals("s1e1", state.episodes.single { it.isCurrent }.itemId)
    }

    @Test
    fun listRefreshPreservesSelectionForTheSamePlayingItem() {
        val state = EpisodeBrowserState().update(episodes, "s1e1").selectSeason("number:2")
        val refreshed = episodes + episode("s2e2", "number:2", "Season Two")
        val updated = state.update(refreshed, "s1e1")

        assertEquals("number:2", updated.selectedSeasonKey)
        assertEquals(listOf("s2e1", "s2e2"), updated.visibleEpisodes.map { it.itemId })
    }

    @Test
    fun changingPlayingItemResetsSelectionEvenIfBrowsedSeasonStillExists() {
        val state = EpisodeBrowserState().update(episodes, "s1e1").selectSeason("number:2")

        assertEquals("number:1", state.update(episodes, "s1e2").selectedSeasonKey)
    }

    @Test
    fun changingCurrentFlagWithoutMetadataResetsSelection() {
        val state = EpisodeBrowserState().update(episodes, null).selectSeason("number:0")
        val updatedEpisodes = listOf(
            episode("s1e1", "number:1"),
            episode("s2e1", "number:2", current = true)
        )

        assertEquals("number:2", state.update(updatedEpisodes, null).selectedSeasonKey)
    }

    @Test
    fun reloadingSamePlayingItemResetsSelectionToCurrentSeason() {
        val state = EpisodeBrowserState().update(episodes, "s1e1").selectSeason("number:2")

        assertEquals(
            "number:1",
            state.update(episodes, "s1e1", resetSelection = true).selectedSeasonKey
        )
    }

    @Test
    fun unavailableSelectionFallsBackToCurrentSeason() {
        val state = EpisodeBrowserState().update(episodes, "s1e1").selectSeason("number:2")
        val updated = state.update(episodes.filterNot { it.seasonKey == "number:2" }, "s1e1")

        assertEquals("number:1", updated.selectedSeasonKey)
        assertSame(updated, updated.selectSeason("unavailable"))
    }

    @Test
    fun emptyListClearsSelectionAndLaterResultsSelectCurrentSeason() {
        val state = EpisodeBrowserState().update(episodes, "s1e1").selectSeason("number:2")
        val empty = state.update(emptyList(), "s1e1")

        assertNull(empty.selectedSeasonKey)
        assertEquals(emptyList<EpisodeSeason>(), empty.seasons)
        assertEquals(emptyList<EpisodeListItemRecord>(), empty.visibleEpisodes)
        assertEquals("number:1", empty.update(episodes, "s1e1").selectedSeasonKey)
    }

    @Test
    fun oldBridgePayloadShowsAllEpisodesAsOneGroup() {
        val oldEpisodes = listOf(
            EpisodeListItemRecord().apply { itemId = "one" },
            EpisodeListItemRecord().apply {
                itemId = "two"
                isCurrent = true
            }
        )
        val state = EpisodeBrowserState().update(oldEpisodes, "two")

        assertEquals(listOf(EpisodeSeason("", "")), state.seasons)
        assertEquals("", state.selectedSeasonKey)
        assertEquals(oldEpisodes, state.visibleEpisodes)
    }

    @Test
    fun repeatedNamesDoNotMergeDifferentSeasonKeys() {
        val episodes = listOf(
            episode("one", "key:a", "Season"),
            episode("two", "key:b", "Season")
        )
        val state = EpisodeBrowserState().update(episodes, null)

        assertEquals(2, state.seasons.size)
        assertEquals(listOf("two"), state.selectSeason("key:b").visibleEpisodes.map { it.itemId })
    }
}
