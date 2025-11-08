import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { FC } from "react";
import { Platform, View, type ViewProps } from "react-native";
import { RoundButton } from "@/components/RoundButton";
import { useRefreshMetadata } from "@/hooks/useRefreshMetadata";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const RefreshMetadata: FC<Props> = ({ item, ...props }) => {
  const { refreshMetadata, isRefreshing } = useRefreshMetadata(item);

  if (Platform.OS === "ios") {
    return (
      <View {...props}>
        <RoundButton
          size='large'
          icon='reload-outline'
          onPress={refreshMetadata}
          hapticFeedback={!isRefreshing}
        />
      </View>
    );
  }

  return (
    <View {...props}>
      <RoundButton
        size='large'
        icon='reload-outline'
        onPress={refreshMetadata}
        hapticFeedback={!isRefreshing}
      />
    </View>
  );
};
