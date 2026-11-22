"""Turn the fixed demo inventory into local ten-second playback placeholders.

The titles and relationships come from inventory.json; no media is copied from
the demo server. See CATALOG.md for the inventory's provenance and limits.
"""

import os
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

MEDIA_SECONDS = 10


def identifier(entry):
    ident = entry["key"].split(":", 1)[1]
    if ident in (".", "..") or not re.fullmatch(r"[A-Za-z0-9._-]+", ident):
        raise ValueError(f"Unsafe inventory key: {entry['key']}")
    return ident


def nfo(path, tag, fields, provider_ids=None):
    root = ET.Element(tag)
    for key, value in fields.items():
        if value is not None:
            ET.SubElement(root, key).text = str(value)
    for name, value in sorted((provider_ids or {}).items()):
        ET.SubElement(root, "uniqueid", {"type": name.lower()}).text = str(value)
    content = ET.tostring(root, encoding="unicode") + "\n"
    if path.is_file() and path.read_text() == content:
        return False
    path.write_text(content)
    return True


def video_template(target):
    if target.is_file() and target.stat().st_size:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"color=c=0x1f2937:size=640x360:rate=24:duration={MEDIA_SECONDS}",
        "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={MEDIA_SECONDS}",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
        "-shortest", "-movflags", "+faststart", str(target),
    ], check=True)
    return True


def audio_template(target):
    if target.is_file() and target.stat().st_size:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-t", str(MEDIA_SECONDS), "-c:a", "flac", str(target),
    ], check=True)
    return True


def copy_video(template, target):
    if target.is_file() and target.stat().st_size:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise RuntimeError(f"Empty catalog file needs manual review: {target}")
    try:
        os.link(template, target)
    except OSError:
        shutil.copyfile(template, target)
    return True


def tag_audio(template, target, tags):
    if target.is_file() and target.stat().st_size:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(template), "-c:a", "copy",
        *[option for name, value in tags.items() for option in ("-metadata", f"{name}={value}")],
        str(target),
    ], check=True)
    return True


def generate(root, inventory):
    """Create only missing media and changed NFOs; never remove pre-existing entries."""
    templates = root / "templates"
    video = templates / "catalog-black-silent-10s.mp4"
    audio = templates / "catalog-silent-10s.flac"
    changed = video_template(video)
    changed = audio_template(audio) or changed

    for movie in inventory["movies"]:
        ident = identifier(movie)
        folder = root / "movies" / ident
        changed = copy_video(video, folder / f"{ident}.mp4") or changed
        changed = nfo(
            folder / "movie.nfo", "movie",
            {"title": movie["title"], "year": movie.get("year")},
            movie.get("providerIds"),
        ) or changed

    shows = {show["key"]: show for show in inventory["shows"]}
    for show in inventory["shows"]:
        folder = root / "shows" / identifier(show)
        folder.mkdir(parents=True, exist_ok=True)
        changed = nfo(
            folder / "tvshow.nfo", "tvshow",
            {"title": show["title"], "year": show.get("year")},
            show.get("providerIds"),
        ) or changed
    for episode in inventory["episodes"]:
        show = shows[episode["showKey"]]
        season = root / "shows" / identifier(show) / f"Season {episode['season']:02d}"
        stem = f"{episode['episode']:02d}_{identifier(episode)}"
        changed = copy_video(video, season / f"{stem}.mp4") or changed
        changed = nfo(
            season / f"{stem}.nfo", "episodedetails",
            {
                "title": episode["title"], "showtitle": show["title"],
                "season": episode["season"], "episode": episode["episode"],
            },
            episode.get("providerIds"),
        ) or changed

    artists = {}
    for track in inventory["tracks"]:
        artist = artists.setdefault(track["artistKey"], track)
        folder = root / "music" / identifier({"key": track["artistKey"]})
        folder.mkdir(parents=True, exist_ok=True)
        changed = nfo(
            folder / "artist.nfo", "artist",
            {"name": artist["artist"]}, artist.get("artistProviderIds"),
        ) or changed
        album = folder / identifier({"key": track["albumKey"]})
        tags = {
            "title": track["title"], "artist": track["artist"],
            "album": track["album"], "album_artist": track["artist"],
            "track": str(track["track"]),
        }
        artist_id = track.get("artistProviderIds", {}).get("MusicBrainzArtist")
        album_ids = track.get("albumProviderIds", {})
        if artist_id:
            tags["MUSICBRAINZ_ALBUMARTISTID"] = artist_id
        for key, tag in (
            ("MusicBrainzAlbum", "MUSICBRAINZ_ALBUMID"),
            ("MusicBrainzReleaseGroup", "MUSICBRAINZ_RELEASEGROUPID"),
        ):
            if album_ids.get(key):
                tags[tag] = album_ids[key]
        target = album / f"{track['track']:02d}_{identifier(track)}.flac"
        changed = tag_audio(audio, target, tags) or changed
    return changed


def expected_items(inventory):
    """Names and relationships observable through Jellyfin's library items endpoint."""
    shows = {show["key"]: show["title"] for show in inventory["shows"]}
    artists = {track["artistKey"]: track["artist"] for track in inventory["tracks"]}
    albums = {
        track["albumKey"]: (track["album"], track["artist"])
        for track in inventory["tracks"]
    }
    return {
        "Maestro Movies": [
            {"Name": movie["title"], "Type": "Movie"} for movie in inventory["movies"]
        ],
        "Maestro Shows": [
            *({"Name": show["title"], "Type": "Series"} for show in inventory["shows"]),
            *(
                {
                    "Name": episode["title"], "Type": "Episode",
                    "SeriesName": shows[episode["showKey"]],
                    "ParentIndexNumber": episode["season"],
                    "IndexNumber": episode["episode"],
                }
                for episode in inventory["episodes"]
            ),
        ],
        "Maestro Music": [
            *({"Name": name, "Type": "MusicArtist"} for name in artists.values()),
            *(
                {"Name": name, "Type": "MusicAlbum", "AlbumArtist": artist}
                for name, artist in albums.values()
            ),
            *(
                {
                    "Name": track["title"], "Type": "Audio",
                    "Album": track["album"], "AlbumArtist": track["artist"],
                    "IndexNumber": track["track"],
                }
                for track in inventory["tracks"]
            ),
        ],
    }
