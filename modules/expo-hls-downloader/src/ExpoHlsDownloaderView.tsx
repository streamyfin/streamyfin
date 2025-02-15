import { requireNativeView } from 'expo';
import * as React from 'react';

import { ExpoHlsDownloaderViewProps } from './ExpoHlsDownloader.types';

const NativeView: React.ComponentType<ExpoHlsDownloaderViewProps> =
  requireNativeView('ExpoHlsDownloader');

export default function ExpoHlsDownloaderView(props: ExpoHlsDownloaderViewProps) {
  return <NativeView {...props} />;
}
