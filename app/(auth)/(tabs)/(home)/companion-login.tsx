import { Platform } from "react-native";
import { CompanionLoginScreen } from "@/components/companion/CompanionLoginScreen";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";

export default function CompanionLoginPage() {
  useDismissKeyboardOnLeave();
  if (Platform.isTV) return null;
  return <CompanionLoginScreen />;
}
