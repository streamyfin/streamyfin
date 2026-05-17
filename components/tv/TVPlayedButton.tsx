import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import React from "react";
import { useTVDesignTokens } from "@/constants/TVSizes";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { TVButton } from "./TVButton";

export interface TVPlayedButtonProps {
  item: BaseItemDto;
  disabled?: boolean;
}

export const TVPlayedButton: React.FC<TVPlayedButtonProps> = ({
  item,
  disabled,
}) => {
  const isPlayed = item.UserData?.Played ?? false;
  const toggle = useMarkAsPlayed([item]);
  const tv = useTVDesignTokens();

  return (
    <TVButton
      onPress={() => toggle(!isPlayed)}
      variant='glass'
      square
      disabled={disabled}
    >
      <Ionicons
        name={isPlayed ? "checkmark-circle" : "checkmark-circle-outline"}
        size={tv.size(28)}
        color='#FFFFFF'
      />
    </TVButton>
  );
};
