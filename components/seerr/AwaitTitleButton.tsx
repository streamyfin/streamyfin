import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useAwaitedTitles } from "@/hooks/useAwaitedTitles";
import { useMyNotifications } from "@/hooks/useMyNotifications";
import { useSeerr } from "@/hooks/useSeerr";
import { awaitRequestFrom, showsAwaitButton } from "@/utils/awaitedTitles";
import type { MediaType, MovieDetails, TvDetails } from "@/utils/seerr/types";

/**
 * Lets the person wait for a title the server does not have, and be told when it arrives,
 * by Seerr or by hand (streamyfin/jellyfin-plugin-streamyfin#225). A second press stops.
 * Phone only: a TV gets no notifications, and its Seerr page is another component.
 */
export const AwaitTitleButton: React.FC<{
  details: MovieDetails | TvDetails | undefined;
  mediaType: MediaType;
  className?: string;
}> = ({ details, mediaType, className = "" }) => {
  const { t } = useTranslation();
  const { seerrUser } = useSeerr();
  const { mine } = useMyNotifications();
  const { supported, titles, isAwaited, add, remove } = useAwaitedTitles();

  const request = awaitRequestFrom(details, mediaType);
  // Nothing until the plugin has answered both: a button that appears, then goes because the
  // event turns out not to reach the person, would be worse than one that appears late.
  if (!supported || !titles || !mine || !request) return null;
  if (
    !showsAwaitButton({
      details,
      seerrUserId: seerrUser?.id,
      events: mine.events,
    })
  ) {
    return null;
  }

  const waiting = isAwaited(request.mediaType, request.tmdbId);
  const label = t(
    waiting ? "seerr.awaited.waiting" : "seerr.awaited.notify_me",
  );
  return (
    <Button
      className={`bg-purple-600/50 border-purple-400 ring-purple-400 text-purple-100 ${className}`}
      style={{ borderWidth: 1, borderStyle: "solid" }}
      accessibilityLabel={label}
      accessibilityHint={waiting ? t("seerr.awaited.stop_hint") : undefined}
      accessibilityState={{ selected: waiting }}
      onPress={() =>
        waiting ? remove(request.mediaType, request.tmdbId) : add(request)
      }
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
