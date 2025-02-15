import type { StyleProp, ViewStyle } from "react-native";

export type OnProgressEventPayload = {
  progress: number;
};

export type OnErrorEventPayload = {
  error: string;
};

export type OnCompleteEventPayload = {
  location: string;
};

export type ExpoHlsDownloaderModuleEvents = {
  onProgress: (params: OnProgressEventPayload) => void;
  onError: (params: OnErrorEventPayload) => void;
  onComplete: (params: OnCompleteEventPayload) => void;
};

export type ExpoHlsDownloaderViewProps = {
  url: string;
  style?: StyleProp<ViewStyle>;
};
