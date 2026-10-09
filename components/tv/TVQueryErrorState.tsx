import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { View, type ViewStyle } from "react-native";
import { Text } from "@/components/common/Text";
import { TVButton } from "@/components/tv/TVButton";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

interface Props {
  /** Usually the query's `refetch`. */
  onRetry: () => void;
  /**
   * True when nothing else on screen should take the initial focus. With no
   * content, Retry is the only thing to focus, unless something above (a
   * source toggle) already owns it.
   */
  hasTVPreferredFocus?: boolean;
  /** Spacing from the screen edges, as the screen's own content uses. */
  style?: ViewStyle;
}

/**
 * The TV counterpart of `QueryErrorState`: a screen whose first request failed
 * says so and offers Retry instead of falling through to its empty state.
 */
export const TVQueryErrorState: React.FC<Props> = ({
  onRetry,
  hasTVPreferredFocus = false,
  style,
}) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();

  return (
    <View
      style={[
        { flex: 1, alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
      <Ionicons
        name='cloud-offline-outline'
        size={scaleSize(64)}
        color='#4b5563'
      />
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "600",
          color: "#fff",
          marginTop: scaleSize(16),
          textAlign: "center",
        }}
      >
        {t("common.something_went_wrong")}
      </Text>
      <Text
        style={{
          fontSize: typography.callout,
          color: "rgba(255,255,255,0.6)",
          marginTop: scaleSize(8),
          marginBottom: scaleSize(32),
          textAlign: "center",
        }}
      >
        {t("common.load_failed_message")}
      </Text>
      {/* Never disabled while retrying: a disabled button drops the focus,
          and a second press only restarts the request. */}
      <TVButton onPress={onRetry} hasTVPreferredFocus={hasTVPreferredFocus}>
        <Text
          style={{
            fontSize: typography.callout,
            fontWeight: "bold",
            color: "#000000",
          }}
        >
          {t("home.retry")}
        </Text>
      </TVButton>
    </View>
  );
};
