import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVButton } from "@/components/tv/TVButton";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

// One fixed width for both: neighbours of uneven size read as a rendering bug
// on TV, and the two labels differ in length in every language.
const BUTTON_WIDTH = scaleSize(300);
const DISABLED_OPACITY = 0.4;

interface Props {
  onPlayAll: () => void;
  onShuffle: () => void;
  /** Nothing to queue. */
  disabled: boolean;
}

/** Play All and Shuffle above the filter bar of the TV library page. */
export const TVLibraryPlayButtons: React.FC<Props> = ({
  onPlayAll,
  onShuffle,
  disabled,
}) => {
  const typography = useScaledTVTypography();
  const { t } = useTranslation();

  const actions = [
    { icon: "play", label: t("library.play_all"), onPress: onPlayAll },
    { icon: "shuffle", label: t("player.shuffle"), onPress: onShuffle },
  ] as const;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        gap: scaleSize(16),
        paddingBottom: scaleSize(24),
      }}
    >
      {actions.map(({ icon, label, onPress }) => (
        <TVButton
          key={icon}
          onPress={onPress}
          disabled={disabled}
          variant='glass'
          style={{
            width: BUTTON_WIDTH,
            opacity: disabled ? DISABLED_OPACITY : 1,
          }}
        >
          <Ionicons
            name={icon}
            size={scaleSize(28)}
            color='#FFFFFF'
            style={{ marginRight: scaleSize(10) }}
          />
          <Text
            numberOfLines={1}
            style={{
              fontSize: typography.callout,
              fontWeight: "bold",
              color: "#FFFFFF",
              flexShrink: 1,
            }}
          >
            {label}
          </Text>
        </TVButton>
      ))}
    </View>
  );
};
