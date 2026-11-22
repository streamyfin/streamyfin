# Demo catalog provenance

The local fixture inventory is copied from `feat/test-server-data-seeding` and checked
against the media visible to the `demo` account on
[jellyfin-demo](https://jellyfin-demo.moab.markrickert.me) on 2026-11-22. All 296 movie
titles, 14 series titles, 230 `(series, season, episode, title)` slots, and 94
`(title, album, artist, track)` slots matched. The committed `inventory.json`
keeps only 20 movies, four series with three episodes each, and 15 tracks in
five albums by five artists. This is enough to scroll a few screens without
enriching hundreds of items. The complete server snapshot remains private
and ignored by git; each retained record keeps its original identifiers.

The inventory contains titles, years, relationships and external catalog identifiers.
It contains **no original movie or music files**, descriptions, posters, license records
or source URLs. A title or TMDb/IMDb/MusicBrainz ID is not proof that the underlying
work or any particular recording is public domain. The local seed generates its own
black video and silent audio; it never copies or downloads media from the demo server.
Do not use these placeholders as a source for redistributing actual films or recordings.
