import axios from "axios";

export interface SubtitleTrack {
  index: number;
  name: string;
  uri: string;
  language: string;
  default: boolean;
  forced: boolean;
  autoSelect: boolean;
}

export async function parseM3U8ForSubtitles(
  url: string,
): Promise<SubtitleTrack[]> {
  try {
    const response = await axios.get(url, { responseType: "text" });
    const lines = response.data.split(/\r?\n/);
    const subtitleTracks: SubtitleTrack[] = [];
    let index = 0;

    lines.forEach((line: string) => {
      if (line.startsWith("#EXT-X-MEDIA:TYPE=SUBTITLES")) {
        const attributes = parseAttributes(line);
        const track: SubtitleTrack = {
          index: index++,
          name: attributes.NAME || "",
          uri: attributes.URI || "",
          language: attributes.LANGUAGE || "",
          default: attributes.DEFAULT === "YES",
          forced: attributes.FORCED === "YES",
          autoSelect: attributes.AUTOSELECT === "YES",
        };
        subtitleTracks.push(track);
      }
    });

    return subtitleTracks;
  } catch (error) {
    console.error("Failed to fetch or parse the M3U8 file:", error);
    throw error;
  }
}

function parseAttributes(line: string): { [key: string]: string } {
  const attributes: { [key: string]: string } = {};
  const regex = /([A-Z-]+)=(?:"([^"]*)"|([^,]*))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3]; // quoted or unquoted
    attributes[key] = value;
  }

  return attributes;
}
