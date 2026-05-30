import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch, View } from "react-native";
import { toast } from "sonner-native";
import { storage } from "@/utils/mmkv";
import {
  getServerWolConfig,
  updateServerWolConfig,
  type WakeOnLanConfig,
} from "@/utils/secureCredentials";
import { sendWolPacket, validateMacAddress } from "@/utils/wol";
import { Button } from "../Button";
import { Input } from "../common/Input";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

const DEFAULT_CONFIG: WakeOnLanConfig = {
  enabled: false,
  macAddress: "",
};

export function WakeOnLanSettings(): React.ReactElement | null {
  const { t } = useTranslation();

  const remoteUrl = storage.getString("serverUrl");
  const [config, setConfig] = useState<WakeOnLanConfig>(DEFAULT_CONFIG);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (remoteUrl) {
      const existingConfig = getServerWolConfig(remoteUrl);
      if (existingConfig) {
        setConfig(existingConfig);
      }
    }
  }, [remoteUrl]);

  const saveConfig = useCallback(
    (newConfig: WakeOnLanConfig) => {
      if (!remoteUrl) return;
      setConfig(newConfig);
      updateServerWolConfig(remoteUrl, newConfig);
    },
    [remoteUrl],
  );

  const handleToggleEnabled = useCallback(
    (enabled: boolean) => {
      saveConfig({ ...config, enabled });
    },
    [config, saveConfig],
  );

  const handleMacAddressChange = useCallback(
    (macAddress: string) => {
      saveConfig({ ...config, macAddress });
    },
    [config, saveConfig],
  );

  const handleTestPacket = useCallback(async () => {
    if (!validateMacAddress(config.macAddress)) {
      toast.error(t("home.settings.network.wake_on_lan.mac_address_invalid"));
      return;
    }

    setIsSending(true);
    try {
      await sendWolPacket(config.macAddress);
      toast.success(t("home.settings.network.wake_on_lan.test_success"));
    } catch {
      toast.error(t("home.settings.network.wake_on_lan.test_error"));
    } finally {
      setIsSending(false);
    }
  }, [config.macAddress, t]);

  if (!remoteUrl) return null;

  const macIsValid =
    config.macAddress.length === 0 || validateMacAddress(config.macAddress);

  return (
    <View>
      <ListGroup title={t("home.settings.network.wake_on_lan.title")}>
        <ListItem
          title={t("home.settings.network.wake_on_lan.enable")}
          subtitle={t("home.settings.network.wake_on_lan.enable_description")}
        >
          <Switch value={config.enabled} onValueChange={handleToggleEnabled} />
        </ListItem>
      </ListGroup>

      {config.enabled && (
        <View className='pt-4'>
          <ListGroup
            title={t("home.settings.network.wake_on_lan.mac_address")}
            description={
              <Text className='text-[#8E8D91] text-xs'>
                {t("home.settings.network.wake_on_lan.mac_address_hint")}
              </Text>
            }
          >
            <View>
              <Input
                placeholder={t(
                  "home.settings.network.wake_on_lan.mac_address_placeholder",
                )}
                value={config.macAddress}
                onChangeText={handleMacAddressChange}
                autoCapitalize='characters'
                autoCorrect={false}
              />
            </View>
          </ListGroup>

          {!macIsValid && (
            <Text className='text-xs text-red-500 px-4 pt-1'>
              {t("home.settings.network.wake_on_lan.mac_address_invalid")}
            </Text>
          )}

          <View className='py-2'>
            <Button
              onPress={handleTestPacket}
              disabled={!validateMacAddress(config.macAddress) || isSending}
            >
              {t("home.settings.network.wake_on_lan.test_packet")}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
