// Factory for creating appropriate audio player instances
import type { Api } from "@jellyfin/sdk";
import type { BaseAudioPlayer, PlayerType } from "./BaseAudioPlayer";
import { LocalPlayer } from "./LocalPlayer";
import { RemotePlayer } from "./RemotePlayer";
import { StreamingPlayer } from "./StreamingPlayer";

/**
 * Configuration for player creation
 */
export interface PlayerConfig {
  api?: Api;
  sessionId?: string;
}

/**
 * Create an audio player of the specified type
 */
export function createPlayer(
  type: PlayerType,
  config: PlayerConfig,
): BaseAudioPlayer {
  switch (type) {
    case "streaming":
      return new StreamingPlayer();

    case "local":
      return new LocalPlayer();

    case "remote":
      if (!config.api || !config.sessionId) {
        throw new Error("RemotePlayer requires api and sessionId in config");
      }
      return new RemotePlayer(config.sessionId, config.api);

    default:
      throw new Error(`Unknown player type: ${type}`);
  }
}
