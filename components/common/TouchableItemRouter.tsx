import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useRouter, useSegments } from "expo-router";
import { PropsWithChildren } from "react";
import { TouchableOpacity, TouchableOpacityProps } from "react-native";
import * as ContextMenu from "@/components/ContextMenu";

interface Props extends TouchableOpacityProps {
  item: BaseItemDto;
}

export const itemRouter = (
  item: BaseItemDto | BaseItemPerson,
  from: string
) => {
  console.log(item.Type, item?.CollectionType);

  if ("CollectionType" in item && item.CollectionType === "livetv") {
    return `/(auth)/(tabs)/${from}/livetv`;
  }

  if (item.Type === "Series") {
    return `/(auth)/(tabs)/${from}/series/${item.Id}`;
  }

  if (item.Type === "Person" || item.Type === "Actor") {
    return `/(auth)/(tabs)/${from}/actors/${item.Id}`;
  }

  if (item.Type === "BoxSet") {
    return `/(auth)/(tabs)/${from}/collections/${item.Id}`;
  }

  if (item.Type === "UserView") {
    return `/(auth)/(tabs)/${from}/collections/${item.Id}`;
  }

  if (item.Type === "CollectionFolder") {
    return `/(auth)/(tabs)/(libraries)/${item.Id}`;
  }

  if (item.Type === "Playlist") {
    return `/(auth)/(tabs)/(libraries)/${item.Id}`;
  }

  return `/(auth)/(tabs)/${from}/items/page?id=${item.Id}`;
};

export const TouchableItemRouter: React.FC<PropsWithChildren<Props>> = ({
  item,
  children,
  ...props
}) => {
  const router = useRouter();
  const segments = useSegments();

  const from = segments[2];

  const markAsPlayedStatus = useMarkAsPlayed(item);

  if (
    from === "(home)" ||
    from === "(search)" ||
    from === "(libraries)" ||
    from === "(favorites)"
  )
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          <TouchableOpacity
            onPress={() => {
              const url = itemRouter(item, from);
              // @ts-ignore
              router.push(url);
            }}
            {...props}
          >
            {children}
          </TouchableOpacity>
        </ContextMenu.Trigger>
        <ContextMenu.Content
          avoidCollisions
          alignOffset={0}
          collisionPadding={0}
          loop={false}
          key={"content"}
        >
          <ContextMenu.Label key="label-1">Actions</ContextMenu.Label>
          <ContextMenu.Item
            key="item-1"
            onSelect={() => {
              markAsPlayedStatus(true);
            }}
            shouldDismissMenuOnSelect
          >
            <ContextMenu.ItemTitle key="item-1-title">
              Mark as watched
            </ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon
              ios={{
                name: "checkmark.circle", // Changed to "checkmark.circle" which represents "watched"
                pointSize: 18,
                weight: "semibold",
                scale: "medium",
                hierarchicalColor: {
                  dark: "green", // Changed to green for "watched"
                  light: "green",
                },
              }}
              androidIconName="checkmark-circle"
            ></ContextMenu.ItemIcon>
          </ContextMenu.Item>
          <ContextMenu.Item
            key="item-2"
            onSelect={() => {
              markAsPlayedStatus(false);
            }}
            shouldDismissMenuOnSelect
            destructive
          >
            <ContextMenu.ItemTitle key="item-2-title">
              Mark as not watched
            </ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon
              ios={{
                name: "eye.slash", // Changed to "eye.slash" which represents "not watched"
                pointSize: 18, // Adjusted for better visibility
                weight: "semibold",
                scale: "medium",
                hierarchicalColor: {
                  dark: "red", // Changed to red for "not watched"
                  light: "red",
                },
                // Removed paletteColors as it's not necessary in this case
              }}
              androidIconName="eye-slash"
            ></ContextMenu.ItemIcon>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    );
};
