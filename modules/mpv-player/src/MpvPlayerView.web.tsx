import { useTranslation } from "react-i18next";
import { MpvPlayerViewProps } from "./MpvPlayer.types";

export default function MpvPlayerView(props: MpvPlayerViewProps) {
  const url = props.source?.url ?? "";
  const { t } = useTranslation();
  return (
    <div>
      <iframe
        title={t("player.mpv_player_title")}
        style={{ flex: 1 }}
        src={url}
        onLoad={() => props.onLoad?.({ nativeEvent: { url } })}
      />
    </div>
  );
}
