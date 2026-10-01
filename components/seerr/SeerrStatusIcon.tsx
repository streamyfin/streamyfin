import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import {
  type SeerrStatusTone,
  seerrStatusBadge,
} from "@/utils/seerr/statusBadge";
import { MediaStatus } from "@/utils/seerr/types";

interface Props {
  mediaStatus?: MediaStatus;
  showRequestIcon: boolean;
  onPress?: () => void;
  /** Drawn smaller, over a poster, so the poster shows. */
  small?: boolean;
}

// Seerr's colours for each tone (StatusBadgeMini); a season row lays its own
// background over the request "+" through className.
const TONE_CLASSES: Record<SeerrStatusTone, string> = {
  processing: "bg-indigo-500 border-indigo-400 ring-indigo-400 text-indigo-100",
  available: "bg-purple-500 border-green-400 ring-green-400 text-green-100",
  pending: "bg-yellow-500 border-yellow-400 ring-yellow-400 text-yellow-100",
  blocklisted: "bg-red-500 border-white-400 ring-white-400 text-white",
  partial: "bg-green-500 border-green-400 ring-green-400 text-green-100",
  request: "bg-green-600",
};

const SeerrStatusIcon: React.FC<Props & ViewProps> = ({
  mediaStatus,
  showRequestIcon,
  onPress,
  small = false,
  ...props
}) => {
  // Derived on each render: set from an effect, the badge was never cleared
  // when a title went back to having none.
  const badge = seerrStatusBadge(mediaStatus, showRequestIcon);

  return (
    badge && (
      <TouchableOpacity onPress={onPress} disabled={onPress === undefined}>
        <View
          className={`${TONE_CLASSES[badge.tone]} rounded-full ${small ? "h-5 w-5" : "h-6 w-6"} flex items-center justify-center ${props.className}`}
          {...props}
        >
          <MaterialCommunityIcons
            name={badge.icon}
            size={small ? 14 : 18}
            color='white'
          />
        </View>
      </TouchableOpacity>
    )
  );
};

export default SeerrStatusIcon;
