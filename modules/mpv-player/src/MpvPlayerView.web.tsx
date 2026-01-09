import { MpvPlayerViewProps } from "./MpvPlayer.types";

export default function MpvPlayerView(props: MpvPlayerViewProps) {
  return (
    <div>
      <iframe
        title='MPV Player'
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
