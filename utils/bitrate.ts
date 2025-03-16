export const formatBitrate = (bitrate?: number | null) => {
  if (!bitrate) return "N/A";

  const sizes = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
  if (bitrate === 0) return "0 bps";
  const i = Number.parseInt(
    Math.floor(Math.log(bitrate) / Math.log(1000)).toString(),
  );
  return Math.round((bitrate / Math.pow(1000, i)) * 100) / 100 + " " + sizes[i];
};
