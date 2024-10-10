import * as React from 'react';

import { VlcPlayerViewProps } from './VlcPlayer.types';

export default function VlcPlayerView(props: VlcPlayerViewProps) {
  return (
    <div>
      <span>{props.name}</span>
    </div>
  );
}
