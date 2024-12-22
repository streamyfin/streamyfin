import {useEffect, useState} from "react";
import {MediaStatus} from "@/utils/jellyseerr/server/constants/media";
import {MaterialCommunityIcons} from "@expo/vector-icons";
import {TouchableOpacity, View, ViewProps} from "react-native";
import {MovieResult, TvResult} from "@/utils/jellyseerr/server/models/Search";

interface Props {
  mediaStatus?: MediaStatus;
  showRequestIcon: boolean;
  onPress?: () => void;
}

const JellyseerrIconStatus: React.FC<Props & ViewProps> = ({
  mediaStatus,
  showRequestIcon,
  onPress,
  ...props
}) => {
  const [badgeIcon, setBadgeIcon] = useState<keyof typeof MaterialCommunityIcons.glyphMap>();
  const [badgeStyle, setBadgeStyle] = useState<string>();

  // Match similar to what Jellyseerr is currently using
  // https://github.com/Fallenbagel/jellyseerr/blob/8a097d5195749c8d1dca9b473b8afa96a50e2fe2/src/components/Common/StatusBadgeMini/index.tsx#L33C1-L62C4
  useEffect(() => {
    switch (mediaStatus) {
      case MediaStatus.PROCESSING:
        setBadgeStyle('bg-indigo-500 border-indigo-400 ring-indigo-400 text-indigo-100');
        setBadgeIcon('clock');
        break;
      case MediaStatus.AVAILABLE:
        setBadgeStyle('bg-purple-500 border-green-400 ring-green-400 text-green-100');
        setBadgeIcon('check')
        break;
      case MediaStatus.PENDING:
        setBadgeStyle('bg-yellow-500 border-yellow-400 ring-yellow-400 text-yellow-100');
        setBadgeIcon('bell')
        break;
      case MediaStatus.BLACKLISTED:
        setBadgeStyle('bg-red-500 border-white-400 ring-white-400 text-white');
        setBadgeIcon('eye-off')
        break;
      case MediaStatus.PARTIALLY_AVAILABLE:
        setBadgeStyle('bg-green-500 border-green-400 ring-green-400 text-green-100');
        setBadgeIcon("minus");
        break;
      default:
        if (showRequestIcon) {
          setBadgeStyle('bg-green-600');
          setBadgeIcon("plus")
        }
        break;
    }
  }, [mediaStatus, showRequestIcon, setBadgeStyle, setBadgeIcon])

  return (
    badgeIcon &&
    <TouchableOpacity onPress={onPress} disabled={onPress == undefined}>
        <View
            className={`${badgeStyle ?? 'bg-purple-600'} rounded-full h-6 w-6 flex items-center justify-center ${props.className}`}
            {...props}
        >
            <MaterialCommunityIcons
                name={badgeIcon}
                size={18}
                color="white"
            />
        </View>
    </TouchableOpacity>
  )
}

export default JellyseerrIconStatus;