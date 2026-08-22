import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import {
  type CustomHeader,
  getIntegrationHeaderConfig,
  type HeaderConfig,
  type HeaderSource,
  type IntegrationKey,
  updateIntegrationHeaderConfig,
} from "@/utils/customHeaders";
import { scaleSize } from "@/utils/scaleSize";
import {
  getServerCustomHeaders,
  updateServerCustomHeaders,
} from "@/utils/secureCredentials";
import { TVCustomHeaderEditor } from "./TVCustomHeaderEditor";
import { TVSectionHeader } from "./TVSectionHeader";
import { TVSettingsOptionButton } from "./TVSettingsOptionButton";
import { TVSettingsRow } from "./TVSettingsRow";

const INTEGRATIONS: { key: IntegrationKey; label: string }[] = [
  { key: "jellyseerr", label: "Jellyseerr" },
  { key: "streamystats", label: "Streamystats" },
  { key: "marlin", label: "Marlin Search" },
];

/**
 * TV settings section for custom proxy auth headers — Jellyfin plus each
 * integration, matching what the mobile network and plugin screens expose.
 */
export function TVCustomHeadersSection({
  serverUrl,
}: {
  serverUrl?: string | null;
}): React.ReactElement {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const [jellyfinHeaders, setJellyfinHeaders] = useState<CustomHeader[]>([]);

  useEffect(() => {
    setJellyfinHeaders(serverUrl ? getServerCustomHeaders(serverUrl) : []);
  }, [serverUrl]);

  // Writing on every keystroke would hit SecureStore and rebuild every client
  // that depends on the headers, so editing stays local until a blur.
  const saveJellyfinHeaders = useCallback(
    (headers: CustomHeader[]) => {
      if (serverUrl) updateServerCustomHeaders(serverUrl, headers);
    },
    [serverUrl],
  );

  return (
    <>
      <TVSectionHeader title={t("custom_headers.title")} />
      <Text
        style={{
          color: "#9CA3AF",
          fontSize: typography.callout - 2,
          marginBottom: scaleSize(16),
          marginLeft: scaleSize(8),
        }}
      >
        {t("custom_headers.description")}
      </Text>

      <TVCustomHeaderEditor
        serviceLabel='Jellyfin'
        headers={jellyfinHeaders}
        onHeadersChange={setJellyfinHeaders}
        onCommit={saveJellyfinHeaders}
        disabled={!serverUrl}
      />

      {INTEGRATIONS.map(({ key, label }) => (
        <TVIntegrationHeaderEditor
          key={key}
          integrationKey={key}
          serviceLabel={label}
        />
      ))}
    </>
  );
}

function TVIntegrationHeaderEditor({
  integrationKey,
  serviceLabel,
}: {
  integrationKey: IntegrationKey;
  serviceLabel: string;
}): React.ReactElement {
  const { t } = useTranslation();
  const { showOptions } = useTVOptionModal();
  const typography = useScaledTVTypography();
  const [config, setConfig] = useState<HeaderConfig>(() =>
    getIntegrationHeaderConfig(integrationKey),
  );

  const save = useCallback(
    (next: HeaderConfig) => {
      setConfig(next);
      updateIntegrationHeaderConfig(integrationKey, next);
    },
    [integrationKey],
  );

  const sourceLabels: Record<HeaderSource, string> = {
    jellyfin: t("custom_headers.source_jellyfin"),
    custom: t("custom_headers.source_custom"),
    none: t("custom_headers.source_none"),
  };

  return (
    <View style={{ marginBottom: scaleSize(24) }}>
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: typography.body,
          fontWeight: "600",
          marginBottom: scaleSize(8),
          marginLeft: scaleSize(8),
        }}
      >
        {serviceLabel}
      </Text>

      <TVSettingsOptionButton
        label={t("custom_headers.title")}
        value={sourceLabels[config.source]}
        onPress={() =>
          showOptions<HeaderSource>({
            title: serviceLabel,
            options: (["none", "jellyfin", "custom"] as HeaderSource[]).map(
              (source) => ({
                label: sourceLabels[source],
                value: source,
                selected: config.source === source,
              }),
            ),
            onSelect: (source) => save({ ...config, source }),
          })
        }
      />

      {config.source === "jellyfin" ? (
        <TVSettingsRow
          label={t("custom_headers.using_jellyfin_headers")}
          value=''
          showChevron={false}
        />
      ) : null}

      {config.source === "custom" ? (
        <TVCustomHeaderEditor
          serviceLabel={`${serviceLabel} — ${t("custom_headers.source_custom")}`}
          headers={config.customHeaders}
          onHeadersChange={(customHeaders) =>
            setConfig((prev) => ({ ...prev, customHeaders }))
          }
          onCommit={(customHeaders) => save({ ...config, customHeaders })}
        />
      ) : null}

      {config.source === "none" ? (
        <TVSettingsRow
          label={t("custom_headers.integration_none")}
          value=''
          showChevron={false}
        />
      ) : null}
    </View>
  );
}
