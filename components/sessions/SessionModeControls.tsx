import { Ionicons } from "@expo/vector-icons";
import {
  GeneralCommandType,
  PlaybackOrder,
  RepeatMode,
  type SessionInfoDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { REMOTE_MODE_CONFIRM_TIMEOUT } from "@/constants/Playback";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  nextRepeatMode,
  ShuffleMode,
  sessionSupportsCommand,
} from "@/utils/jellyfin/playbackModes";

/**
 * Shows a mode from the moment it is requested until the session reports it.
 * The session only does so with its next progress report and the page only
 * sees that on its next poll, and a repeat button that kept its old icon
 * meanwhile would send the same mode again on a second tap instead of moving
 * on to the next one. A report of any other mode is not an answer yet: after
 * two quick taps the poll can catch the session between the two.
 */
const useRequestedMode = <T,>(reported: T) => {
  const [requested, setRequested] = useState<{ value: T } | null>(null);

  // Confirmed: from here on the session speaks for itself again, also when it
  // changes its mind a moment later.
  useEffect(() => {
    if (requested?.value === reported) setRequested(null);
  }, [requested, reported]);

  useEffect(() => {
    if (!requested) return;
    const timer = setTimeout(
      () => setRequested(null),
      REMOTE_MODE_CONFIRM_TIMEOUT,
    );
    return () => clearTimeout(timer);
  }, [requested]);

  return {
    mode: requested ? requested.value : reported,
    /**
     * Returns what takes this request back, and only this one: a failure that
     * comes in late must not cancel the request of a tap made since.
     */
    request: (value: T) => {
      const mine = { value };
      setRequested(mine);
      return () =>
        setRequested((current) => (current === mine ? null : current));
    },
  };
};

interface Props {
  session: SessionInfoDto;
}

/**
 * Shuffle and repeat for a session playing on another client, shown only for
 * the commands that client says it handles.
 */
export const SessionModeControls = ({ session }: Props) => {
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();

  const repeat = useRequestedMode(
    session.PlayState?.RepeatMode ?? RepeatMode.RepeatNone,
  );
  const order = useRequestedMode(
    session.PlayState?.PlaybackOrder ?? PlaybackOrder.Default,
  );

  const canShuffle = sessionSupportsCommand(
    session,
    GeneralCommandType.SetShuffleQueue,
  );
  const canRepeat = sessionSupportsCommand(
    session,
    GeneralCommandType.SetRepeatMode,
  );
  if (!canShuffle && !canRepeat) return null;

  const send = async (
    name: GeneralCommandType,
    args: Record<string, string>,
    onFailure: () => void,
  ) => {
    if (!api || !session.Id) return onFailure();
    try {
      await getSessionApi(api).sendFullGeneralCommand({
        sessionId: session.Id,
        generalCommand: { Name: name, Arguments: args },
      });
    } catch {
      // The button going back to the state the session reports is the
      // feedback: the command did not go out.
      onFailure();
    }
  };

  const shuffled = order.mode === PlaybackOrder.Shuffle;
  const toggleShuffle = () => {
    send(
      GeneralCommandType.SetShuffleQueue,
      { ShuffleMode: shuffled ? ShuffleMode.Sorted : ShuffleMode.Shuffle },
      order.request(shuffled ? PlaybackOrder.Default : PlaybackOrder.Shuffle),
    );
  };

  const cycleRepeat = () => {
    const next = nextRepeatMode(repeat.mode);
    send(
      GeneralCommandType.SetRepeatMode,
      { RepeatMode: next },
      repeat.request(next),
    );
  };

  const repeatLabel = {
    [RepeatMode.RepeatNone]: t("home.sessions.repeat_off"),
    [RepeatMode.RepeatAll]: t("home.sessions.repeat_all"),
    [RepeatMode.RepeatOne]: t("home.sessions.repeat_one"),
  }[repeat.mode];
  const repeating = repeat.mode !== RepeatMode.RepeatNone;

  return (
    <View className='flex flex-row mt-3 justify-center' style={{ gap: 24 }}>
      {canShuffle && (
        <TouchableOpacity
          onPress={toggleShuffle}
          accessibilityRole='button'
          accessibilityLabel={t("music.shuffle")}
          accessibilityState={{ selected: shuffled }}
        >
          <Ionicons
            name='shuffle'
            size={24}
            color={shuffled ? Colors.primary : "white"}
          />
        </TouchableOpacity>
      )}
      {canRepeat && (
        <TouchableOpacity
          onPress={cycleRepeat}
          accessibilityRole='button'
          accessibilityLabel={repeatLabel}
          accessibilityState={{ selected: repeating }}
        >
          <Ionicons
            name='repeat'
            size={24}
            color={repeating ? Colors.primary : "white"}
          />
          {repeat.mode === RepeatMode.RepeatOne && (
            <View className='absolute -right-2 -top-1 bg-purple-600 rounded-full w-4 h-4 items-center justify-center'>
              <Text className='text-white text-[10px] font-bold'>1</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};
