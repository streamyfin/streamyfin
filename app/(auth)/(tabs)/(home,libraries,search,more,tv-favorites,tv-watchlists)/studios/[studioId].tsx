import { useLocalSearchParams } from "expo-router";
import { Platform } from "react-native";
import { StudioPage } from "@/components/studios/StudioPage";
import { TVStudioPage } from "@/components/studios/TVStudioPage";

// The requests behind this screen are covered by utils/jellyfin/search.test.ts.
export default function StudioRoute() {
  const { studioId } = useLocalSearchParams() as { studioId: string };

  // The phone's grid is a FlashList, which the TV focus engine cannot follow.
  if (Platform.isTV) return <TVStudioPage studioId={studioId} />;
  return <StudioPage studioId={studioId} />;
}
