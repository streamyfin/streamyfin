import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { MediaStatus } from "@/utils/seerr/types";

/**
 * Seerr's icon for each status (StatusBadgeMini), which the request sheet
 * also draws for a season, so that a season reads the same everywhere.
 */
export const SEERR_STATUS_ICONS: Partial<
  Record<MediaStatus, keyof typeof MaterialCommunityIcons.glyphMap>
> = {
  [MediaStatus.PROCESSING]: "clock",
  [MediaStatus.AVAILABLE]: "check",
  [MediaStatus.PENDING]: "bell",
  [MediaStatus.BLOCKLISTED]: "eye-off",
  [MediaStatus.PARTIALLY_AVAILABLE]: "minus",
};

interface Props {
  mediaStatus?: MediaStatus;
  showRequestIcon: boolean;
  onPress?: () => void;
  /** Drawn smaller, over a poster, so the poster shows. */
  small?: boolean;
}

const SeerrStatusIcon: React.FC<Props & ViewProps> = ({
  mediaStatus,
  showRequestIcon,
  onPress,
  small = false,
  ...props
}) => {
  const [badgeIcon, setBadgeIcon] =
    useState<keyof typeof MaterialCommunityIcons.glyphMap>();
  const [badgeStyle, setBadgeStyle] = useState<string>();

  // Match similar to what Seerr is currently using
  // https://github.com/seerr-team/seerr/blob/8a097d5195749c8d1dca9b473b8afa96a50e2fe2/src/components/Common/StatusBadgeMini/index.tsx#L33C1-L62C4
  useEffect(() => {
    switch (mediaStatus) {
      case MediaStatus.PROCESSING:
        setBadgeStyle(
          "bg-indigo-500 border-indigo-400 ring-indigo-400 text-indigo-100",
        );
        setBadgeIcon(SEERR_STATUS_ICONS[MediaStatus.PROCESSING]);
        break;
      case MediaStatus.AVAILABLE:
        setBadgeStyle(
          "bg-purple-500 border-green-400 ring-green-400 text-green-100",
        );
        setBadgeIcon(SEERR_STATUS_ICONS[MediaStatus.AVAILABLE]);
        break;
      case MediaStatus.PENDING:
        setBadgeStyle(
          "bg-yellow-500 border-yellow-400 ring-yellow-400 text-yellow-100",
        );
        setBadgeIcon(SEERR_STATUS_ICONS[MediaStatus.PENDING]);
        break;
      case MediaStatus.BLOCKLISTED:
        setBadgeStyle("bg-red-500 border-white-400 ring-white-400 text-white");
        setBadgeIcon(SEERR_STATUS_ICONS[MediaStatus.BLOCKLISTED]);
        break;
      case MediaStatus.PARTIALLY_AVAILABLE:
        setBadgeStyle(
          "bg-green-500 border-green-400 ring-green-400 text-green-100",
        );
        setBadgeIcon(SEERR_STATUS_ICONS[MediaStatus.PARTIALLY_AVAILABLE]);
        break;
      default:
        if (showRequestIcon) {
          setBadgeStyle("bg-green-600");
          setBadgeIcon("plus");
        }
        break;
    }
  }, [mediaStatus, showRequestIcon, setBadgeStyle, setBadgeIcon]);

  return (
    badgeIcon && (
      <TouchableOpacity onPress={onPress} disabled={onPress === undefined}>
        <View
          className={`${badgeStyle ?? "bg-purple-600"} rounded-full ${small ? "h-5 w-5" : "h-6 w-6"} flex items-center justify-center ${props.className}`}
          {...props}
        >
          <MaterialCommunityIcons
            name={badgeIcon}
            size={small ? 14 : 18}
            color='white'
          />
        </View>
      </TouchableOpacity>
    )
  );
};

export default SeerrStatusIcon;
