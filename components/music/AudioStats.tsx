import { Ionicons } from "@expo/vector-icons";
import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { View } from "react-native";
import { Badge } from "@/components/Badge";
import { formatBitrate } from "@/utils/bitrate";

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return null;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
};

const formatSampleRate = (sampleRate?: number | null) => {
  if (!sampleRate) return null;
  return `${(sampleRate / 1000).toFixed(1)} kHz`;
};

interface Props {
  mediaSource: MediaSourceInfo | null | undefined;
  isTranscoding: boolean;
}

/**
 * The file playing, as badges: size, codec, direct or transcoding, bitrate
 * and sample rate. Shared by the music and audiobook players; nothing shows
 * until the server has described the file.
 */
export const AudioStats: React.FC<Props> = ({ mediaSource, isTranscoding }) => {
  const audioStream = mediaSource?.MediaStreams?.find(
    (stream) => stream.Type === "Audio",
  );
  const fileSize = formatFileSize(mediaSource?.Size);
  const codec = audioStream?.Codec?.toUpperCase();
  const bitrate = formatBitrate(audioStream?.BitRate);
  const sampleRate = formatSampleRate(audioStream?.SampleRate);

  if (!mediaSource || !(fileSize || codec || bitrate || sampleRate)) {
    return null;
  }
  return (
    <View className='flex-row flex-wrap gap-1.5 mt-3'>
      {fileSize && <Badge variant='gray' text={fileSize} />}
      {codec && <Badge variant='gray' text={codec} />}
      <Badge
        variant='gray'
        text={isTranscoding ? "Transcoding" : "Direct"}
        iconLeft={
          <Ionicons
            name={isTranscoding ? "swap-horizontal" : "play"}
            size={12}
            color='white'
          />
        }
      />
      {bitrate && bitrate !== "N/A" && <Badge variant='gray' text={bitrate} />}
      {sampleRate && <Badge variant='gray' text={sampleRate} />}
    </View>
  );
};
