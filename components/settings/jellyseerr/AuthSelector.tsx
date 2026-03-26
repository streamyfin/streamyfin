import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { Text } from "../../common/Text";
import { ListGroup } from "../../list/ListGroup";
import { ListItem } from "../../list/ListItem";
import { PlatformDropdown } from "../../PlatformDropdown";

export enum AuthMethod {
  JELLYFIN = "jellyfin",
  SEERR = "seerr",
  WEB = "web",
}

interface Props extends ViewProps {
  selection: AuthMethod;
  onSelect: (selection: AuthMethod) => void;
}

export const JellyseerrAuthSelector: React.FC<Props> = ({
  selection,
  onSelect,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const options = useMemo(
    () => [
      {
        type: "radio" as const,
        label: t("home.settings.plugins.jellyseerr.auth_methods.jellyfin"),
        value: AuthMethod.JELLYFIN,
        selected: selection === AuthMethod.JELLYFIN,
        onPress: () => {
          onSelect(AuthMethod.JELLYFIN);
          setOpen(false);
        },
      },
      {
        type: "radio" as const,
        label: t("home.settings.plugins.jellyseerr.auth_methods.seerr"),
        value: AuthMethod.SEERR,
        selected: selection === AuthMethod.SEERR,
        onPress: () => {
          onSelect(AuthMethod.SEERR);
          setOpen(false);
        },
      },
      {
        type: "radio" as const,
        label: t("home.settings.plugins.jellyseerr.auth_methods.other"),
        value: AuthMethod.WEB,
        selected: selection === AuthMethod.WEB,
        onPress: () => {
          onSelect(AuthMethod.WEB);
          setOpen(false);
        },
      },
    ],
    [t, selection, onSelect],
  );

  return (
    <View>
      <ListGroup title={t("home.settings.plugins.jellyseerr.auth_method")}>
        <ListItem title={t("home.settings.plugins.jellyseerr.auth_method")}>
          <PlatformDropdown
            open={open}
            onOpenChange={setOpen}
            groups={[{ options }]}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-2'>
                  {options.find((opt) => opt.value === selection)?.label}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.plugins.jellyseerr.auth_method")}
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
