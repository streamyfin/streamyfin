import type { TFunction } from "i18next";
import { Platform } from "react-native";
import type { OutputPickerStrings } from "@/modules/mpv-player/src/cast";

/** The output sheet's texts for presentOutputPicker, one key per sentence. */
export const buildOutputPickerStrings = (t: TFunction): OutputPickerStrings => {
  // An iPhone and an iPad are named as Apple names them; Android says phone and tablet.
  const ios = Platform.OS === "ios";
  return {
    title: t("cast.output.title"),
    thisPhone: ios ? t("cast.output.this_iphone") : t("cast.output.this_phone"),
    thisTablet: ios ? t("cast.output.this_ipad") : t("cast.output.this_tablet"),
    playing: t("cast.output.playing"),
    castCaption: t("cast.output.cast_caption"),
    searching: t("cast.output.searching"),
    noDevices: t("cast.output.no_devices"),
    playServicesMissing: t("cast.output.play_services_missing"),
    playServicesUpdate: t("cast.output.play_services_update"),
    playServicesAction: t("cast.output.play_services_action"),
    connecting: t("cast.output.connecting"),
    cancel: t("common.cancel"),
    connected: t("cast.output.connected"),
    reconnecting: t("cast.output.reconnecting"),
    change: t("cast.output.change"),
    mute: t("cast.output.mute"),
    unmute: t("cast.output.unmute"),
    volume: t("cast.output.volume"),
    remote: t("cast.output.remote"),
    stopPlayback: t("player.stopPlayback"),
    disconnect: t("cast.output.disconnect"),
    deviceGone: t("cast.output.device_gone"),
    receiverUnavailable: t("cast.output.receiver_unavailable"),
    network: t("cast.output.network"),
    failed: t("cast.output.failed"),
    airPlay: t("cast.output.airplay"),
    airPlayCaption: t("cast.output.airplay_caption"),
  };
};
