import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { useWifiSSID } from "@/hooks/useWifiSSID";
import { openLocationSettings } from "@/modules/wifi-ssid";
import { useServerUrl } from "@/providers/ServerUrlProvider";
import { storage } from "@/utils/mmkv";
import {
  getServerLocalConfig,
  type LocalNetworkConfig,
  updateServerLocalConfig,
} from "@/utils/secureCredentials";
import { Button } from "../Button";
import { Input } from "../common/Input";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

const DEFAULT_CONFIG: LocalNetworkConfig = {
  localUrl: "",
  homeWifiSSIDs: [],
  enabled: false,
};

interface StatusDisplayProps {
  currentSSID: string | null;
  connectedToWifi: boolean;
  isUsingLocalUrl: boolean;
  locationBlocked: boolean;
  onOpenLocationSettings: () => void;
  t: (key: string) => string;
}

function StatusDisplay({
  currentSSID,
  connectedToWifi,
  isUsingLocalUrl,
  locationBlocked,
  onOpenLocationSettings,
  t,
}: StatusDisplayProps): React.ReactElement {
  const wifiStatus = currentSSID
    ? currentSSID
    : connectedToWifi
      ? t("home.settings.network.ssid_hidden")
      : t("home.settings.network.not_connected");
  const urlType = isUsingLocalUrl
    ? t("home.settings.network.local")
    : t("home.settings.network.remote");
  const urlTypeColor = isUsingLocalUrl ? "text-green-500" : "text-blue-500";

  return (
    <View className='px-4 py-2 bg-neutral-900 rounded-xl mt-4'>
      <View className='flex-row justify-between items-center py-1'>
        <Text className='text-neutral-400'>
          {t("home.settings.network.current_wifi")}
        </Text>
        <Text>{wifiStatus}</Text>
      </View>
      <View className='flex-row justify-between items-center py-1'>
        <Text className='text-neutral-400'>
          {t("home.settings.network.using_url")}
        </Text>
        <Text className={urlTypeColor}>{urlType}</Text>
      </View>

      {locationBlocked && (
        <View className='mt-2 pt-2 border-t border-neutral-800'>
          <Text className='text-xs text-amber-400'>
            {t("home.settings.network.location_off_description")}
          </Text>
          <TouchableOpacity
            onPress={onOpenLocationSettings}
            className='mt-2 self-start'
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className='text-xs text-blue-400 font-semibold'>
              {t("home.settings.network.open_location_settings")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export function LocalNetworkSettings(): React.ReactElement | null {
  const { t } = useTranslation();
  const { permissionStatus, requestPermission } = useWifiSSID();
  const { isUsingLocalUrl, currentSSID, connectedToWifi, refreshUrlState } =
    useServerUrl();

  // Connected to Wi-Fi and have permission, but the OS won't reveal the SSID —
  // on Android this means device Location services are off.
  const locationBlocked =
    permissionStatus === "granted" && connectedToWifi && !currentSSID;

  const handleOpenLocationSettings = useCallback(() => {
    openLocationSettings();
  }, []);

  const remoteUrl = storage.getString("serverUrl");
  const [config, setConfig] = useState<LocalNetworkConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (remoteUrl) {
      const existingConfig = getServerLocalConfig(remoteUrl);
      if (existingConfig) {
        setConfig(existingConfig);
      }
    }
  }, [remoteUrl]);

  const saveConfig = useCallback(
    (newConfig: LocalNetworkConfig) => {
      if (!remoteUrl) return;
      setConfig(newConfig);
      updateServerLocalConfig(remoteUrl, newConfig);
      // Trigger URL re-evaluation after config change
      refreshUrlState();
    },
    [remoteUrl, refreshUrlState],
  );

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (enabled && permissionStatus !== "granted") {
        const granted = await requestPermission();
        if (!granted) {
          toast.error(t("home.settings.network.permission_denied"));
          return;
        }
      }
      saveConfig({ ...config, enabled });
    },
    [config, permissionStatus, requestPermission, saveConfig, t],
  );

  const handleLocalUrlChange = useCallback(
    (localUrl: string) => {
      saveConfig({ ...config, localUrl });
    },
    [config, saveConfig],
  );

  const handleAddCurrentNetwork = useCallback(() => {
    if (!currentSSID) {
      toast.error(t("home.settings.network.no_wifi_connected"));
      return;
    }
    if (config.homeWifiSSIDs.includes(currentSSID)) {
      toast.info(t("home.settings.network.network_already_added"));
      return;
    }
    saveConfig({
      ...config,
      homeWifiSSIDs: [...config.homeWifiSSIDs, currentSSID],
    });
    toast.success(t("home.settings.network.network_added"));
  }, [config, currentSSID, saveConfig, t]);

  const handleRemoveNetwork = useCallback(
    (ssidToRemove: string) => {
      saveConfig({
        ...config,
        homeWifiSSIDs: config.homeWifiSSIDs.filter((s) => s !== ssidToRemove),
      });
    },
    [config, saveConfig],
  );

  if (!remoteUrl) return null;

  const addNetworkButtonText = currentSSID
    ? t("home.settings.network.add_current_network", { ssid: currentSSID })
    : t("home.settings.network.not_connected_to_wifi");

  return (
    <View>
      <ListGroup title={t("home.settings.network.local_network")}>
        <ListItem
          title={t("home.settings.network.auto_switch_enabled")}
          subtitle={t("home.settings.network.auto_switch_description")}
        >
          <SettingSwitch
            value={config.enabled}
            onValueChange={handleToggleEnabled}
          />
        </ListItem>
      </ListGroup>

      {config.enabled && (
        <View className='pt-4'>
          <ListGroup
            title={t("home.settings.network.local_url")}
            description={
              <Text className='text-[#8E8D91] text-xs'>
                {t("home.settings.network.local_url_hint")}
              </Text>
            }
          >
            <View className=''>
              <Input
                placeholder={t("home.settings.network.local_url_placeholder")}
                value={config.localUrl}
                onChangeText={handleLocalUrlChange}
                keyboardType='url'
                autoCapitalize='none'
                autoCorrect={false}
              />
            </View>
          </ListGroup>

          <ListGroup
            title={t("home.settings.network.home_wifi_networks")}
            className='mt-4'
          >
            {config.homeWifiSSIDs.map((wifiSSID) => (
              <ListItem key={wifiSSID} title={wifiSSID}>
                <TouchableOpacity
                  onPress={() => handleRemoveNetwork(wifiSSID)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name='close-circle' size={22} color='#EF4444' />
                </TouchableOpacity>
              </ListItem>
            ))}
            {config.homeWifiSSIDs.length === 0 && (
              <ListItem
                title={t("home.settings.network.no_networks_configured")}
                subtitle={t("home.settings.network.add_network_hint")}
              />
            )}
          </ListGroup>

          {!locationBlocked && (
            <View className='py-2'>
              <Button
                onPress={handleAddCurrentNetwork}
                disabled={!currentSSID || permissionStatus !== "granted"}
              >
                {addNetworkButtonText}
              </Button>
            </View>
          )}

          <StatusDisplay
            currentSSID={currentSSID}
            connectedToWifi={connectedToWifi}
            isUsingLocalUrl={isUsingLocalUrl}
            locationBlocked={locationBlocked}
            onOpenLocationSettings={handleOpenLocationSettings}
            t={t}
          />
        </View>
      )}

      {permissionStatus === "denied" && (
        <View className='py-2'>
          <Text className='text-xs text-red-500'>
            {t("home.settings.network.permission_denied_explanation")}
          </Text>
        </View>
      )}
    </View>
  );
}
