export const supportsOriginalAudioLanguage = (version?: string | null) =>
  Number.parseInt(version ?? "12", 10) >= 12;
