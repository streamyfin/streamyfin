import { Platform } from "react-native";
import { Libraries } from "@/components/library/Libraries";
import { TVLibraries } from "@/components/library/TVLibraries";

export default function LibrariesPage() {
  if (Platform.isTV) {
    return <TVLibraries />;
  }

  return <Libraries />;
}
