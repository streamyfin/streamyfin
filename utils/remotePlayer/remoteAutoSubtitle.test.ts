import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { Settings } from "@/utils/atoms/settings";
import type { ReceiverPlay } from "@/utils/remotePlayer/playOnRemote";
import {
  evaluateRemoteAutoSubtitle,
  INITIAL_REMOTE_AUTO_SUBTITLE,
} from "./remoteAutoSubtitle";

const item = (id: string): BaseItemDto => ({
  Id: id,
  Type: "Episode",
  MediaSources: [
    {
      Id: `source-${id}`,
      MediaStreams: [
        { Type: "Audio", Index: 1, Language: "eng" },
        {
          Type: "Subtitle",
          Index: 3,
          Language: "fre",
          Codec: "subrip",
          IsTextSubtitleStream: true,
        },
      ],
    },
  ],
});
const play = (id: string, subtitleIndex = -1): ReceiverPlay => ({
  item: item(id),
  positionTicks: 0,
  mediaSourceId: `source-${id}`,
  audioIndex: 1,
  subtitleIndex,
});
const settings = {
  subtitlesOnMute: true,
  subtitlesOnMuteAllowRestart: false,
} as Settings;

const mutedOn = (id: string) =>
  evaluateRemoteAutoSubtitle(INITIAL_REMOTE_AUTO_SUBTITLE, {
    muted: true,
    play: play(id),
    settings,
  });

describe("evaluateRemoteAutoSubtitle", () => {
  test("a TV already muted when the screen shows its play is a mute", () => {
    expect(mutedOn("a").action).toEqual({ kind: "apply", index: 3 });
  });

  test("no play forgets everything", () => {
    const { next, action } = evaluateRemoteAutoSubtitle(mutedOn("a").next, {
      muted: true,
      play: null,
      settings,
    });
    expect(next).toEqual(INITIAL_REMOTE_AUTO_SUBTITLE);
    expect(action).toEqual({ kind: "none" });
  });

  // The TV reports the track a moment after it was asked for: until then it is not the user turning it off.
  test("the TV not reporting the applied track yet does not hand it to the user", () => {
    const { next, action } = evaluateRemoteAutoSubtitle(mutedOn("a").next, {
      muted: true,
      play: play("a"),
      settings,
    });
    expect(action).toEqual({ kind: "none" });
    expect(next.state.released).toBe(false);
    expect(
      evaluateRemoteAutoSubtitle(next, {
        muted: false,
        play: play("a", 3),
        settings,
      }).action,
    ).toEqual({ kind: "revert" });
  });

  test("the setting off keeps the mute it saw, so turning it on later is no mute", () => {
    const { next, action } = evaluateRemoteAutoSubtitle(
      INITIAL_REMOTE_AUTO_SUBTITLE,
      {
        muted: true,
        play: play("a"),
        settings: { ...settings, subtitlesOnMute: false },
      },
    );
    expect(action).toEqual({ kind: "none" });
    expect(
      evaluateRemoteAutoSubtitle(next, {
        muted: true,
        play: play("a"),
        settings,
      }).action,
    ).toEqual({ kind: "none" });
  });

  test("the sound back on the next episode undoes the track carried to it", () => {
    const first = mutedOn("a").next;
    const shown = evaluateRemoteAutoSubtitle(first, {
      muted: true,
      play: play("a", 3),
      settings,
    }).next;
    const { action } = evaluateRemoteAutoSubtitle(shown, {
      muted: false,
      play: play("b", 3),
      settings,
    });
    expect(action).toEqual({ kind: "revert" });
  });
});
