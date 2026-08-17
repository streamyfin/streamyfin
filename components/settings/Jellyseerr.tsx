import { useMutation } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { toast } from "sonner-native";
import { useIntegrationHeaders } from "@/hooks/useIntegrationHeaders";
import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import { userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { jellyseerrProbe } from "@/utils/serverUrl/probes/jellyseerr";
import { resolveServerUrl } from "@/utils/serverUrl/resolve";
import { Button } from "../Button";
import { Input } from "../common/Input";
import { ServerUrlField } from "../common/ServerUrlField";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { CustomHeaderSelector } from "./CustomHeaderSelector";

export const JellyseerrSettings = () => {
  const { jellyseerrUser, setJellyseerrUser, clearAllJellyseerData } =
    useJellyseerr();

  const { t } = useTranslation();

  const [user] = useAtom(userAtom);
  const { settings, updateSettings, pluginSettings } = useSettings();
  // Only the server URL is admin-lockable — the password stays editable so
  // the user can still sign in to the admin-pinned Jellyseerr server.
  const urlLocked = pluginSettings?.jellyseerrServerUrl?.locked === true;
  const apiKeyLocked = pluginSettings?.jellyseerrApiKey?.locked === true;

  const [jellyseerrPassword, setJellyseerrPassword] = useState<
    string | undefined
  >(undefined);
  const [jellyseerrApiKeyInput, setJellyseerrApiKeyInput] = useState<string>(
    settings?.jellyseerrApiKey ?? "",
  );

  const [jellyseerrServerUrl, setjellyseerrServerUrl] = useState<string>(
    settings?.jellyseerrServerUrl ?? "",
  );
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(
    settings?.jellyseerrServerUrl ?? undefined,
  );

  const { headers: customHeaders, resolveOptions } =
    useIntegrationHeaders("jellyseerr");

  const loginToJellyseerrMutation = useMutation({
    mutationFn: async () => {
      if (!user?.Name)
        throw new Error("Missing required information for login");

      // When the URL is admin-pinned, target that server directly. Otherwise
      // trust resolvedUrl only while it matches the field (the field adopts
      // the canonical URL after a successful resolve); any other input is
      // resolved fresh here, so tapping Login right after editing can never
      // silently target the previous server.
      let finalUrl = "";
      if (urlLocked) {
        finalUrl = settings?.jellyseerrServerUrl ?? "";
      } else if (resolvedUrl && resolvedUrl === jellyseerrServerUrl) {
        finalUrl = resolvedUrl;
      } else if (jellyseerrServerUrl) {
        const resolved = await resolveServerUrl(
          jellyseerrServerUrl,
          jellyseerrProbe,
          { headers: customHeaders },
        );
        if (!resolved.ok) throw new Error("Invalid server url");
        finalUrl = resolved.url;
      }
      if (!finalUrl) throw new Error("Missing server url");

      // An API key signs in via the Seerr account linked to the Jellyfin user
      // — no password involved. Falls back to the classic password login.
      const apiKey = apiKeyLocked
        ? settings?.jellyseerrApiKey
        : jellyseerrApiKeyInput.trim() || undefined;

      const jellyseerrTempApi = new JellyseerrApi(
        finalUrl,
        customHeaders,
        apiKey,
      );
      const testResult = await jellyseerrTempApi.test();
      if (!testResult.isValid) throw new Error("Invalid server url");

      if (apiKey) {
        if (!user.Id) throw new Error("Missing required information for login");
        const loggedInUser = await jellyseerrTempApi.loginWithApiKey(user.Id);
        return { user: loggedInUser, url: finalUrl, apiKey };
      }

      const loggedInUser = await jellyseerrTempApi.login(
        user.Name,
        jellyseerrPassword || "",
      );
      return { user: loggedInUser, url: finalUrl, apiKey: undefined };
    },
    onSuccess: ({ user: loggedInUser, url, apiKey }) => {
      setJellyseerrUser(loggedInUser);
      setResolvedUrl(url);
      updateSettings({ jellyseerrServerUrl: url, jellyseerrApiKey: apiKey });
    },
    onError: () => {
      toast.error(t("jellyseerr.failed_to_login"));
    },
    onSettled: () => {
      setJellyseerrPassword(undefined);
    },
  });

  const clearData = () => {
    clearAllJellyseerData().finally(() => {
      setJellyseerrUser(undefined);
      setJellyseerrPassword(undefined);
      setJellyseerrApiKeyInput("");
      setjellyseerrServerUrl("");
      setResolvedUrl(undefined);
    });
  };

  return (
    <View className=''>
      <View>
        {jellyseerrUser ? (
          <>
            <ListGroup title={"Jellyseerr"}>
              <ListItem
                title={t(
                  "home.settings.plugins.jellyseerr.total_media_requests",
                )}
                value={jellyseerrUser?.requestCount?.toString()}
              />
              <ListItem
                title={t("home.settings.plugins.jellyseerr.movie_quota_limit")}
                value={
                  jellyseerrUser?.movieQuotaLimit?.toString() ??
                  t("home.settings.plugins.jellyseerr.unlimited")
                }
              />
              <ListItem
                title={t("home.settings.plugins.jellyseerr.movie_quota_days")}
                value={
                  jellyseerrUser?.movieQuotaDays?.toString() ??
                  t("home.settings.plugins.jellyseerr.unlimited")
                }
              />
              <ListItem
                title={t("home.settings.plugins.jellyseerr.tv_quota_limit")}
                value={
                  jellyseerrUser?.tvQuotaLimit?.toString() ??
                  t("home.settings.plugins.jellyseerr.unlimited")
                }
              />
              <ListItem
                title={t("home.settings.plugins.jellyseerr.tv_quota_days")}
                value={
                  jellyseerrUser?.tvQuotaDays?.toString() ??
                  t("home.settings.plugins.jellyseerr.unlimited")
                }
              />
            </ListGroup>

            <View className='p-4'>
              <Button color='red' onPress={clearData}>
                {t(
                  "home.settings.plugins.jellyseerr.reset_jellyseerr_config_button",
                )}
              </Button>
            </View>
          </>
        ) : (
          <View className='flex flex-col rounded-xl overflow-hidden p-4 bg-neutral-900'>
            <View style={{ opacity: urlLocked ? 0.5 : 1 }}>
              <View className='mb-2'>
                <ServerUrlField
                  value={
                    urlLocked
                      ? (settings?.jellyseerrServerUrl ?? "")
                      : jellyseerrServerUrl
                  }
                  onChangeText={(url) => {
                    setjellyseerrServerUrl(url);
                    // Editing invalidates the previous resolution.
                    setResolvedUrl(undefined);
                  }}
                  onResolved={(url) => setResolvedUrl(url)}
                  probe={jellyseerrProbe}
                  label={t("home.settings.plugins.jellyseerr.server_url")}
                  hint={t("home.settings.plugins.jellyseerr.server_url_hint")}
                  placeholder={t(
                    "home.settings.plugins.jellyseerr.server_url_placeholder",
                  )}
                  editable={!urlLocked && !loginToJellyseerrMutation.isPending}
                  resolveOptions={resolveOptions}
                />
                {urlLocked && (
                  <Text className='text-xs text-red-600 mb-2'>
                    {t("home.settings.disabled_by_admin")}
                  </Text>
                )}
              </View>
            </View>

            <CustomHeaderSelector
              integrationKey='jellyseerr'
              title={t("custom_headers.title")}
              description={t("custom_headers.integration_description")}
            />
            <View>
              {apiKeyLocked ? (
                <Text className='text-xs opacity-50 mb-2'>
                  {t("home.settings.plugins.jellyseerr.api_key_from_admin", {
                    username: user?.Name,
                  })}
                </Text>
              ) : (
                <>
                  <Text className='font-bold mb-2'>
                    {t("home.settings.plugins.jellyseerr.password")}
                  </Text>
                  <Input
                    className='border border-neutral-800'
                    autoFocus={true}
                    focusable={true}
                    placeholder={t(
                      "home.settings.plugins.jellyseerr.password_placeholder",
                      { username: user?.Name },
                    )}
                    value={jellyseerrPassword}
                    keyboardType='default'
                    secureTextEntry={true}
                    returnKeyType='done'
                    autoCapitalize='none'
                    textContentType='password'
                    onChangeText={setJellyseerrPassword}
                    editable={!loginToJellyseerrMutation.isPending}
                  />
                  <Text className='font-bold mb-2 mt-4'>
                    {t("home.settings.plugins.jellyseerr.api_key")}
                  </Text>
                  <Text className='text-xs opacity-50 mb-2'>
                    {t("home.settings.plugins.jellyseerr.api_key_hint")}
                  </Text>
                  <Input
                    className='border border-neutral-800'
                    placeholder={t(
                      "home.settings.plugins.jellyseerr.api_key_placeholder",
                    )}
                    value={jellyseerrApiKeyInput}
                    keyboardType='default'
                    secureTextEntry={true}
                    returnKeyType='done'
                    autoCapitalize='none'
                    autoCorrect={false}
                    onChangeText={setJellyseerrApiKeyInput}
                    editable={!loginToJellyseerrMutation.isPending}
                  />
                </>
              )}
              <Button
                loading={loginToJellyseerrMutation.isPending}
                disabled={loginToJellyseerrMutation.isPending}
                color='purple'
                className='h-12 mt-2'
                onPress={() => loginToJellyseerrMutation.mutate()}
              >
                {apiKeyLocked || jellyseerrApiKeyInput.trim()
                  ? t("home.settings.plugins.jellyseerr.connect_button")
                  : t("home.settings.plugins.jellyseerr.login_button")}
              </Button>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};
