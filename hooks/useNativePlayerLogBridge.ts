import { useEffect } from "react";
import { Platform } from "react-native";
import MpvPlayerModule from "@/modules/mpv-player";
import { type LogLevel, writeToLog } from "@/utils/log";

const levelForNativeType = (type: string): LogLevel => {
  switch (type) {
    case "Error":
      return "ERROR";
    case "Warn":
      return "WARN";
    default:
      return "INFO";
  }
};

/**
 * Mirrors the native player's log (mpv errors/warnings, the negotiated audio
 * output, the AVAudioSession route) into the JS app log so it shows up in
 * Settings → Logs and in the exported logs.txt. Without this the native side
 * writes to a file nobody reads, which is why silent-audio reports from tvOS
 * never came with evidence.
 *
 * iOS/tvOS only: the Android module has no Logger to bridge.
 */
export function useNativePlayerLogBridge() {
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const subscription = MpvPlayerModule.addListener(
      "onNativeLog",
      ({ message, type }) => {
        writeToLog(levelForNativeType(type), `[native player] ${message}`);
      },
    );
    return () => subscription.remove();
  }, []);
}
