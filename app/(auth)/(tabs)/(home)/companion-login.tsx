import { Platform } from "react-native";
import { CompanionLoginScreen } from "@/components/companion/CompanionLoginScreen";

export default function CompanionLoginPage() {
  if (Platform.isTV) return null;
  return <CompanionLoginScreen />;
}
