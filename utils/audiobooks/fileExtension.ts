/**
 * The file extension to store a part under. The server lists every name its
 * prober gave the container ("mov,mp4,m4a,3gp,3g2,mj2"), and iOS tells a local
 * file's format by its extension: an MP4 audio file is stored as m4a, m4b
 * books included.
 */
export const audiobookFileExtension = (container?: string | null): string => {
  const names = (container ?? "")
    .toLowerCase()
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) return "m4a";
  if (names.some((name) => ["m4a", "m4b", "mp4", "mov"].includes(name))) {
    return "m4a";
  }
  return names[0];
};
