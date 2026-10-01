import type React from "react";
import Svg, { Path } from "react-native-svg";

/**
 * The icon Seerr puts on its request buttons (RequestButton): Heroicons'
 * arrow-down-tray, 24 outline. Heroicons, MIT, Copyright (c) Tailwind Labs, Inc.
 */
export const SeerrRequestIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 20,
  color = "white",
}) => (
  <Svg
    width={size}
    height={size}
    viewBox='0 0 24 24'
    fill='none'
    stroke={color}
    strokeWidth={1.5}
  >
    <Path
      strokeLinecap='round'
      strokeLinejoin='round'
      d='M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3'
    />
  </Svg>
);
