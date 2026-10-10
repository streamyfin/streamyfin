import { useLocalSearchParams } from "expo-router";
import { Platform } from "react-native";
import { Upcoming } from "@/components/upcoming/Upcoming";

// Not `Upcoming.tv`: a TV build resolves that suffix first, and would hand
// this file the TV screen under the phone's import as well.
const TVUpcoming = Platform.isTV
  ? require("@/components/upcoming/TVUpcoming").TVUpcoming
  : null;

// Covered by components/upcoming/Upcoming.test.tsx: a spec in app/ would
// become a route.
export default function UpcomingPage() {
  const { parentId } = useLocalSearchParams<{ parentId?: string }>();
  if (TVUpcoming) return <TVUpcoming parentId={parentId} />;
  return <Upcoming parentId={parentId} />;
}
