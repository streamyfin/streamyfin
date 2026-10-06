import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { HeaderButton } from "@/components/common/HeaderButton";
import useRouter from "@/hooks/useAppRouter";
import { useSyncPlay } from "@/providers/SyncPlayProvider";

/** Entry shared by library headers and playback controls. */
export function SyncPlayButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const { group } = useSyncPlay();

  return (
    <HeaderButton
      testID='syncplay-open'
      accessibilityRole='button'
      accessibilityLabel={t("syncplay.title")}
      accessibilityHint={t("syncplay.description")}
      onPress={() => router.push("/(auth)/syncplay")}
    >
      <Ionicons
        name={group ? "people" : "people-outline"}
        size={24}
        color={group ? "#c084fc" : "white"}
      />
    </HeaderButton>
  );
}
