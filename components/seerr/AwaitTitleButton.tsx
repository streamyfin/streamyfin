import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StyleProp, ViewStyle } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { AWAITED_TITLE_EVENT } from "@/constants/Notifications";
import { useAwaitedTitles } from "@/hooks/useAwaitedTitles";
import { useMyNotifications } from "@/hooks/useMyNotifications";
import { awaitRequestFrom, showsAwaitButton } from "@/utils/awaitedTitles";
import type { MediaType, MovieDetails, TvDetails } from "@/utils/seerr/types";
import { createSubmission } from "@/utils/submission";

/**
 * Lets the person wait for a title the server does not have, and be told when it arrives,
 * by Seerr or by hand (streamyfin/jellyfin-plugin-streamyfin#225). A second press stops.
 * Phone only: a TV gets no notifications, and its Seerr page is another component.
 */
export const AwaitTitleButton: React.FC<{
  details: MovieDetails | TvDetails | undefined;
  mediaType: MediaType;
  /** The person's Seerr account, to tell a title they requested themselves. */
  seerrUserId: number | undefined;
  className?: string;
  // NativeWind hands the classes a caller gives as this style.
  style?: StyleProp<ViewStyle>;
}> = ({ details, mediaType, seerrUserId, className = "", style }) => {
  const { t } = useTranslation();
  const { mine } = useMyNotifications();
  // Read only where the plugin offers the event: there is nothing to wait for otherwise.
  const offered = !!mine?.events.some(
    (event) => event.key === AWAITED_TITLE_EVENT,
  );
  const { supported, titles, isAwaited, add, remove } = useAwaitedTitles({
    enabled: offered,
  });
  // One press at a time: a second one while the first is on its way, a double tap or the
  // duplicate press Android TV can deliver, would undo it.
  const submission = useRef(createSubmission()).current;
  const [busy, setBusy] = useState(false);

  const request = awaitRequestFrom(details, mediaType);
  // Nothing until the plugin has answered both: a button that appears, then goes because the
  // event turns out not to reach the person, would be worse than one that appears late.
  if (!supported || !titles || !mine || !request) return null;

  const waiting = isAwaited(request.mediaType, request.tmdbId);
  // A title they wait for keeps its button, so they can stop, whatever changed since.
  if (
    !waiting &&
    !showsAwaitButton({ details, seerrUserId, events: mine.events })
  ) {
    return null;
  }

  const label = t(
    waiting ? "seerr.awaited.waiting" : "seerr.awaited.notify_me",
  );
  return (
    <Button
      className={`bg-purple-600/50 border-purple-400 ring-purple-400 text-purple-100 ${className}`}
      style={[{ borderWidth: 1, borderStyle: "solid" }, style]}
      accessibilityLabel={label}
      accessibilityHint={waiting ? t("seerr.awaited.stop_hint") : undefined}
      accessibilityState={{ selected: waiting }}
      disabled={busy}
      onPress={async () => {
        if (!submission.start()) return;
        setBusy(true);
        try {
          await (waiting
            ? remove(request.mediaType, request.tmdbId)
            : add(request));
        } finally {
          submission.finish();
          setBusy(false);
        }
      }}
      iconLeft={
        <Ionicons
          name={waiting ? "notifications" : "notifications-outline"}
          size={20}
          color='white'
        />
      }
    >
      <Text className='text-sm'>{label}</Text>
    </Button>
  );
};
