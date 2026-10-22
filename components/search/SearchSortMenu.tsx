import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Text as RNText } from "@/components/common/Text";
import type { SortOrder } from "@/components/search/searchSort";
import { Colors } from "@/constants/Colors";
import {
  SEARCH_SORT_BUTTON_WIDTH,
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

/** One sort the menu offers, its label already translated. */
export interface SearchSortOption<T extends string> {
  value: T;
  label: string;
}

interface SearchSortMenuProps<T extends string> {
  sorts: SearchSortOption<T>[];
  sort: T;
  onSort: (value: T) => void;
  /** Left out for a sort that has no direction, as relevance. */
  order?: SortOrder;
  onOrder: (value: SortOrder) => void;
  t: (key: string) => string;
}

const orderOptions = ["asc", "desc"] as const;

/**
 * The Search screen's sort button and the menu it opens, for the Library and
 * the Discover results alike: the sorts, then the orders.
 */
export const SearchSortMenu = <T extends string>({
  sorts,
  sort,
  onSort,
  order,
  onOrder,
  t,
}: SearchSortMenuProps<T>) => {
  const current = sorts.find((s) => s.value === sort);

  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <Host
        style={{
          justifyContent: "center",
          alignItems: "center",
          overflow: "visible",
          height: SEARCH_TAB_ROW_HEIGHT,
          width: SEARCH_SORT_BUTTON_WIDTH,
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
                <Text modifiers={[font({ textStyle: "body" })]}>{"​"}</Text>
              </HStack>
            </Button>
          }
        >
          <Menu
            label={`${t("library.filters.sort_by")}: ${current?.label ?? ""}`}
          >
            {sorts.map((item) => (
              <Button
                key={item.value}
                label={item.label}
                systemImage={
                  item.value === sort ? "checkmark.circle.fill" : "circle"
                }
                onPress={() => onSort(item.value)}
              />
            ))}
          </Menu>
          {order && (
            <Menu
              label={`${t("library.filters.sort_order")}: ${t(
                `library.filters.${order}`,
              )}`}
            >
              {orderOptions.map((item) => (
                <Button
                  key={item}
                  label={t(`library.filters.${item}`)}
                  systemImage={
                    order === item ? "checkmark.circle.fill" : "circle"
                  }
                  onPress={() => onOrder(item)}
                />
              ))}
            </Menu>
          )}
        </Menu>
      </Host>
    );
  }

  return (
    <AndroidSearchSortMenu
      sorts={sorts}
      sort={sort}
      onSort={onSort}
      order={order}
      onOrder={onOrder}
      t={t}
    />
  );
};

/**
 * One button and the menu it drops down, as on iOS: Material's own dropdown,
 * the sorts and then the orders, the current one of each marked.
 */
const AndroidSearchSortMenu = <T extends string>({
  sorts,
  sort,
  onSort,
  order,
  onOrder,
  t,
}: SearchSortMenuProps<T>) => {
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
          {sorts.map((item) => (
            <DropdownMenuItem
              key={item.value}
              onClick={() => pick(() => onSort(item.value))}
            >
              <DropdownMenuItem.LeadingIcon>
                <RadioButton selected={item.value === sort} />
              </DropdownMenuItem.LeadingIcon>
              <DropdownMenuItem.Text>
                <Text>{item.label}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
          {order && <HorizontalDivider />}
          {order && heading(t("library.filters.sort_order"))}
          {order &&
            orderOptions.map((item) => (
              <DropdownMenuItem
                key={item}
                onClick={() => pick(() => onOrder(item))}
              >
                <DropdownMenuItem.LeadingIcon>
                  <RadioButton selected={order === item} />
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
