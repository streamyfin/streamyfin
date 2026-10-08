import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Text as RNText } from "@/components/common/Text";
import { SeerrSearchSort } from "@/components/seerr/SeerrIndexPage";
import { Colors } from "@/constants/Colors";
import {
  DISCOVER_FILTER_WIDTH,
  SEARCH_TAB_ROW_HEIGHT,
} from "@/constants/Values";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import crashes the route tree on tvOS at module load.
// Load it lazily and only off-TV; TV never renders this component.
const { Button, Host, HStack, Image, Menu, Text } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : (require("@expo/ui/swift-ui") as typeof import("@expo/ui/swift-ui"));
const { accessibilityLabel, buttonStyle, font } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : (require("@expo/ui/swift-ui/modifiers") as typeof import("@expo/ui/swift-ui/modifiers"));
// The Jetpack Compose views exist only in Android builds.
const compose =
  Platform.OS === "android" && !Platform.isTV
    ? (require("@expo/ui/jetpack-compose") as typeof import("@expo/ui/jetpack-compose"))
    : ({} as typeof import("@expo/ui/jetpack-compose"));

interface DiscoverFiltersProps {
  seerrOrderBy: SeerrSearchSort;
  setSeerrOrderBy: (value: SeerrSearchSort) => void;
  seerrSortOrder: "asc" | "desc";
  setSeerrSortOrder: (value: "asc" | "desc") => void;
  t: (key: string) => string;
}

const sortOptions = Object.keys(SeerrSearchSort).filter((v) =>
  Number.isNaN(Number(v)),
);

const orderOptions = ["asc", "desc"] as const;

export const DiscoverFilters: React.FC<DiscoverFiltersProps> = ({
  seerrOrderBy,
  setSeerrOrderBy,
  seerrSortOrder,
  setSeerrSortOrder,
  t,
}) => {
  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <Host
        style={{
          justifyContent: "center",
          alignItems: "center",
          overflow: "visible",
          height: SEARCH_TAB_ROW_HEIGHT,
          width: DISCOVER_FILTER_WIDTH,
          marginLeft: "auto",
        }}
      >
        <Menu
          label={
            <Button
              modifiers={[
                buttonStyle("glass"),
                accessibilityLabel(t("library.filters.sort_by")),
              ]}
            >
              {/* Built like the Library and Discover buttons, a body-sized
                  label: the zero-width text gives the icon a line of text's
                  height, so the three stay the same height at any text size. */}
              <HStack spacing={0}>
                <Image
                  systemName='line.3.horizontal.decrease.circle'
                  modifiers={[font({ textStyle: "body" })]}
                />
                <Text modifiers={[font({ textStyle: "body" })]}>
                  {"\u200B"}
                </Text>
              </HStack>
            </Button>
          }
        >
          <Menu
            label={`${t("library.filters.sort_by")}: ${t(
              `home.settings.plugins.seerr.order_by.${seerrOrderBy}`,
            )}`}
          >
            {sortOptions.map((item) => {
              const isSelected =
                seerrOrderBy === (item as unknown as SeerrSearchSort);
              return (
                <Button
                  key={item}
                  label={t(`home.settings.plugins.seerr.order_by.${item}`)}
                  systemImage={isSelected ? "checkmark.circle.fill" : "circle"}
                  onPress={() =>
                    setSeerrOrderBy(item as unknown as SeerrSearchSort)
                  }
                />
              );
            })}
          </Menu>
          <Menu
            label={`${t("library.filters.sort_order")}: ${t(
              `library.filters.${seerrSortOrder}`,
            )}`}
          >
            {orderOptions.map((item) => {
              const isSelected = seerrSortOrder === item;
              return (
                <Button
                  key={item}
                  label={t(`library.filters.${item}`)}
                  systemImage={isSelected ? "checkmark.circle.fill" : "circle"}
                  onPress={() => setSeerrSortOrder(item)}
                />
              );
            })}
          </Menu>
        </Menu>
      </Host>
    );
  }

  return (
    <AndroidDiscoverFilters
      seerrOrderBy={seerrOrderBy}
      setSeerrOrderBy={setSeerrOrderBy}
      seerrSortOrder={seerrSortOrder}
      setSeerrSortOrder={setSeerrSortOrder}
      t={t}
    />
  );
};

/**
 * One button and the menu it drops down, as on iOS: Material's own dropdown,
 * the sorts and then the orders, the current one of each marked.
 */
const AndroidDiscoverFilters: React.FC<DiscoverFiltersProps> = ({
  seerrOrderBy,
  setSeerrOrderBy,
  seerrSortOrder,
  setSeerrSortOrder,
  t,
}) => {
  const [open, setOpen] = useState(false);
  const {
    HorizontalDivider,
    DropdownMenu,
    DropdownMenuItem,
    Host,
    RadioButton,
    RNHostView,
    Text,
  } = compose;

  const pick = (apply: () => void) => {
    setOpen(false);
    apply();
  };
  // A heading is an item that cannot be picked.
  const heading = (label: string) => (
    <DropdownMenuItem enabled={false}>
      <DropdownMenuItem.Text>
        <Text>{label}</Text>
      </DropdownMenuItem.Text>
    </DropdownMenuItem>
  );

  return (
    <Host
      matchContents
      colorScheme='dark'
      seedColor={Colors.primary}
      style={{ marginLeft: "auto" }}
    >
      <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={t("library.filters.sort_by")}
              onPress={() => setOpen(true)}
            >
              {/* Built like the Library and Discover tags beside it: the
                  icon sits in a line of their text, and the spaces around it
                  give that line their font's height, so the three share one
                  height. Purple, as the old Sort by and Sort order buttons. */}
              <View className='bg-purple-600 rounded-full px-2 py-1'>
                <RNText className='p-1'>
                  {" "}
                  <Ionicons name='filter' size={14} color='white' />{" "}
                </RNText>
              </View>
            </Pressable>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {heading(t("library.filters.sort_by"))}
          {sortOptions.map((item) => (
            <DropdownMenuItem
              key={item}
              onClick={() =>
                pick(() => setSeerrOrderBy(item as unknown as SeerrSearchSort))
              }
            >
              <DropdownMenuItem.LeadingIcon>
                <RadioButton
                  selected={
                    seerrOrderBy === (item as unknown as SeerrSearchSort)
                  }
                />
              </DropdownMenuItem.LeadingIcon>
              <DropdownMenuItem.Text>
                <Text>{t(`home.settings.plugins.seerr.order_by.${item}`)}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
          <HorizontalDivider />
          {heading(t("library.filters.sort_order"))}
          {orderOptions.map((item) => (
            <DropdownMenuItem
              key={item}
              onClick={() => pick(() => setSeerrSortOrder(item))}
            >
              <DropdownMenuItem.LeadingIcon>
                <RadioButton selected={seerrSortOrder === item} />
              </DropdownMenuItem.LeadingIcon>
              <DropdownMenuItem.Text>
                <Text>{t(`library.filters.${item}`)}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
};
