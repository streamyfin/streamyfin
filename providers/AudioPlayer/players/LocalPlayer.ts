// Local player for downloaded audio files

import { getAudioDownloadsDatabase } from "../database";
import type { AudioTrack } from "../types";
import type { PlayerType } from "./BaseAudioPlayer";
import { StreamingPlayer } from "./StreamingPlayer";

/**
 * LocalPlayer handles playback of downloaded audio files
 * Extends StreamingPlayer but uses local file:// URIs
 */
export class LocalPlayer extends StreamingPlayer {
  getPlayerType(): PlayerType {
    return "local";
  }

  canHandleTrack(track: AudioTrack): boolean {
    // Check if track is downloaded
    const db = getAudioDownloadsDatabase();

    // Check in standalone tracks
    if (db.tracks[track.jellyfinItem.Id || ""]) {
      return true;
    }

    // Check in album tracks
    for (const album of Object.values(db.albums)) {
      if (album.tracks[track.jellyfinItem.Id || ""]) {
        return true;
      }
    }

    return false;
  }

  async loadTrack(
    track: AudioTrack,
    callback: (status: any) => void,
  ): Promise<void> {
    // Get downloaded file path
    const downloadedTrack = this.getDownloadedTrack(track);

    // Verify the file path exists and is not empty
    if (downloadedTrack?.audioFilePath) {
      // Use local file path
      const localTrack = {
        ...track,
        url: downloadedTrack.audioFilePath,
      };
      console.log(
        `[LocalPlayer] Playing from local file: ${downloadedTrack.audioFilePath}`,
      );
      return super.loadTrack(localTrack, callback);
    } else {
      // Fallback to streaming URL - either not downloaded or download incomplete
      console.warn(
        "[LocalPlayer] Track not found in downloads or file path empty, using streaming URL",
      );
      return super.loadTrack(track, callback);
    }
  }

  private getDownloadedTrack(track: AudioTrack) {
    const db = getAudioDownloadsDatabase();
    const trackId = track.jellyfinItem.Id || "";

    // Check standalone tracks
    if (db.tracks[trackId]) {
      return db.tracks[trackId];
    }

    // Check album tracks
    for (const album of Object.values(db.albums)) {
      if (album.tracks[trackId]) {
        return album.tracks[trackId];
      }
    }

    return null;
  }
}
