import { Platform } from "react-native";
import { LiveTVView } from "@/components/livetv/LiveTVView";
import { TVLiveTVPage } from "@/components/livetv/TVLiveTVPage";

export default function LiveTV() {
  if (Platform.isTV) {
    return <TVLiveTVPage />;
  }

  return <LiveTVView />;
}
