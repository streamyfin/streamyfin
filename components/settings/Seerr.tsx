import { useMutation, useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { toast } from "sonner-native";
import { useIntegrationHeaders } from "@/hooks/useIntegrationHeaders";
import { SeerrApi, useSeerr } from "@/hooks/useSeerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { markExpectedError } from "@/utils/errors";
import { writeErrorLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { deleteSeerrPassword } from "@/utils/seerrPassword";
import {
  isQuickConnectEnabled,
  seerrPasswordNeeded,
  signInWithQuickConnect,
} from "@/utils/seerrQuickConnect";
import { seerrProbe } from "@/utils/serverUrl/probes/seerr";
import { resolveServerUrl } from "@/utils/serverUrl/resolve";
import { store } from "@/utils/store";
import { Button } from "../Button";
import { Input } from "../common/Input";
import { ServerUrlField } from "../common/ServerUrlField";
import { SettingSwitch } from "../common/SettingSwitch";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { CustomHeaderSelector } from "./CustomHeaderSelector";

export const SeerrSettings = () => {
  const { seerrUser, setSeerrUser, clearAllSeerrData } = useSeerr();

  const { t } = useTranslation();

  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);
  const { settings, updateSettings, pluginSettings } = useSettings();
  // Only the server URL is admin-lockable — the password stays editable so
  // the user can still sign in to the admin-pinned Seerr server.
  const urlLocked = pluginSettings?.seerrServerUrl?.locked === true;
  const apiKeyLocked = pluginSettings?.seerrApiKey?.locked === true;

  const [seerrPassword, setSeerrPassword] = useState<string | undefined>(
    undefined,
  );
  const [seerrApiKeyInput, setSeerrApiKeyInput] = useState<string>(
    settings?.seerrApiKey ?? "",
  );

  // The stored key can change after mount (plugin settings load async, and a
  // login rewrites it). Keep the field in sync so what's on screen is always
  // the key that a password login would clear — otherwise a stored key could
  // be wiped invisibly behind an empty-looking input.
  useEffect(() => {
    setSeerrApiKeyInput(settings?.seerrApiKey ?? "");
  }, [settings?.seerrApiKey]);

  const [seerrServerUrl, setSeerrServerUrl] = useState<string>(
    settings?.seerrServerUrl ?? "",
  );
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(
    settings?.seerrServerUrl ?? undefined,
  );
  // Kept through the next attempt, unlike the mutation's own error, so the
  // password field does not vanish while that attempt runs.
  const [signInFailed, setSignInFailed] = useState(false);

  const { headers: customHeaders, resolveOptions } =
    useIntegrationHeaders("seerr");

  const loginToSeerrMutation = useMutation({
    mutationFn: async () => {
      // Everything thrown in this mutation is a user-facing outcome of what
      // they typed (or didn't) — surfaced by onError's toast, never Sentry.
      if (!user?.Name)
        throw markExpectedError(
          new Error("Missing required information for login"),
        );

      // When the URL is admin-pinned, target that server directly. Otherwise
      // trust resolvedUrl only while it matches the field (the field adopts
      // the canonical URL after a successful resolve); any other input is
      // resolved fresh here, so tapping Login right after editing can never
      // silently target the previous server.
      let finalUrl = "";
      if (urlLocked) {
        finalUrl = settings?.seerrServerUrl ?? "";
      } else if (resolvedUrl && resolvedUrl === seerrServerUrl) {
        finalUrl = resolvedUrl;
      } else if (seerrServerUrl) {
        const resolved = await resolveServerUrl(seerrServerUrl, seerrProbe, {
          headers: customHeaders,
        });
        if (!resolved.ok)
          throw markExpectedError(new Error("Invalid server url"));
        finalUrl = resolved.url;
      }
      if (!finalUrl) throw markExpectedError(new Error("Missing server url"));

      // An API key signs in via the Seerr account linked to the Jellyfin user
      // — no password involved. Falls back to the classic password login.
      const apiKey = apiKeyLocked
        ? settings?.seerrApiKey
        : seerrApiKeyInput.trim() || undefined;

      const seerrTempApi = new SeerrApi(finalUrl, customHeaders, apiKey);
      const testResult = await seerrTempApi.test();
      if (!testResult.isValid)
        throw markExpectedError(new Error("Invalid server url"));

      const startedFor = user.Id;
      const stillCurrent = () => store.get(userAtom)?.Id === startedFor;

      // Quick Connect before either credential: it needs neither, and when it
      // opens a session there is no reason for a key or a password to be on
      // this device at all.
      if (api) {
        const quickConnected = await signInWithQuickConnect(
          seerrTempApi,
          api,
          stillCurrent,
        );
        if (quickConnected)
          return {
            user: quickConnected,
            url: finalUrl,
            // A key the plugin locked stays the plugin's to manage. One typed
            // here is dropped, because nothing reads it any more.
            apiKey: apiKeyLocked ? apiKey : undefined,
          };
      }

      // Neither credential for an account that has since been left: replayed
      // now, it would sign the next user in as the previous one.
      if (!stillCurrent())
        throw markExpectedError(new Error("Signed-in account changed"));

      if (apiKey) {
        if (!user.Id)
          throw markExpectedError(
            new Error("Missing required information for login"),
          );
        const loggedInUser = await seerrTempApi.loginWithApiKey(user.Id);
        return { user: loggedInUser, url: finalUrl, apiKey };
      }

      // The form did not ask for a password and Quick Connect did not sign
      // in. Seerr hands the password to Jellyfin as a login for the user's
      // own account, so the empty one would be a failed login there, counted
      // towards the account's lockout. Failing here brings the field up
      // instead. Once it is on screen an empty password is sent as typed: a
      // Jellyfin account can have none.
      if (!seerrPassword && !askPassword)
        throw markExpectedError(new Error("Password needed"));

      const loggedInUser = await seerrTempApi.login(
        user.Name,
        seerrPassword || "",
      );
      return { user: loggedInUser, url: finalUrl, apiKey: undefined };
    },
    onSuccess: ({ user: loggedInUser, url, apiKey }) => {
      setSignInFailed(false);
      setSeerrUser(loggedInUser);
      setResolvedUrl(url);
      updateSettings({ seerrServerUrl: url, seerrApiKey: apiKey });
    },
    onError: () => {
      setSignInFailed(true);
      toast.error(t("seerr.failed_to_login"));
    },
    onSettled: () => {
      setSeerrPassword(undefined);
    },
  });

  // Signing in tries Quick Connect first: on a server that has it, neither
  // the password nor the key that stands in for it is read, so the form does
  // not ask for them.
  const { data: quickConnectEnabled } = useQuery({
    queryKey: ["jellyfin", "quickConnectEnabled", api?.basePath],
    queryFn: async () => (api ? isQuickConnectEnabled(api) : false),
    enabled: !!api && !seerrUser,
    staleTime: 5 * 60 * 1000,
  });
  const askPassword = seerrPasswordNeeded(quickConnectEnabled, signInFailed);

  const clearData = () => {
    clearAllSeerrData().finally(() => {
      setSeerrUser(undefined);
      setSeerrPassword(undefined);
      setSeerrApiKeyInput("");
      setSeerrServerUrl("");
      setResolvedUrl(undefined);
    });
  };

  return (
    <View className=''>
      <View>
        {seerrUser ? (
          <>
            <ListGroup title={"Seerr"}>
              <ListItem
                title={t("home.settings.plugins.seerr.total_media_requests")}
                value={seerrUser?.requestCount?.toString()}
              />
              <ListItem
                title={t("home.settings.plugins.seerr.movie_quota_limit")}
                value={
                  seerrUser?.movieQuotaLimit?.toString() ??
                  t("home.settings.plugins.seerr.unlimited")
                }
              />
              <ListItem
                title={t("home.settings.plugins.seerr.movie_quota_days")}
                value={
                  seerrUser?.movieQuotaDays?.toString() ??
                  t("home.settings.plugins.seerr.unlimited")
                }
              />
              <ListItem
                title={t("home.settings.plugins.seerr.tv_quota_limit")}
                value={
                  seerrUser?.tvQuotaLimit?.toString() ??
                  t("home.settings.plugins.seerr.unlimited")
                }
              />
              <ListItem
                title={t("home.settings.plugins.seerr.tv_quota_days")}
                value={
                  seerrUser?.tvQuotaDays?.toString() ??
                  t("home.settings.plugins.seerr.unlimited")
                }
              />
            </ListGroup>

            {/* Only meaningful when the plugin supplies the URL — that is the
                only case in which the password is stored at all. */}
            {pluginSettings?.seerrServerUrl?.value ? (
              <ListGroup
                className='mt-4'
                title={t("home.settings.plugins.seerr.auto_login_title")}
                description={
                  <Text className='text-xs text-neutral-500'>
                    {t("home.settings.plugins.seerr.auto_login_description")}
                  </Text>
                }
              >
                <ListItem
                  title={t("home.settings.plugins.seerr.auto_login_title")}
                >
                  <SettingSwitch
                    value={settings?.autoLoginSeerr !== false}
                    onValueChange={(value) => {
                      updateSettings({ autoLoginSeerr: value });
                      // Opting out also forgets the already-stored password —
                      // the flag alone would leave the secret on the device.
                      const jellyfinUrl = storage.getString("serverUrl");
                      if (!value && jellyfinUrl && user?.Id) {
                        deleteSeerrPassword(jellyfinUrl, user.Id).catch((e) =>
                          writeErrorLog(
                            `Failed to delete Seerr password: ${e}`,
                          ),
                        );
                      }
                    }}
                  />
                </ListItem>
              </ListGroup>
            ) : null}

            <View className='p-4'>
              <Button color='red' onPress={clearData}>
                {t("home.settings.plugins.seerr.reset_seerr_config_button")}
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
                      ? (settings?.seerrServerUrl ?? "")
                      : seerrServerUrl
                  }
                  onChangeText={(url) => {
                    setSeerrServerUrl(url);
                    // Editing invalidates the previous resolution.
                    setResolvedUrl(undefined);
                  }}
                  onResolved={(url) => setResolvedUrl(url)}
                  probe={seerrProbe}
                  label={t("home.settings.plugins.seerr.server_url")}
                  hint={t("home.settings.plugins.seerr.server_url_hint")}
                  placeholder={t(
                    "home.settings.plugins.seerr.server_url_placeholder",
                  )}
                  editable={!urlLocked && !loginToSeerrMutation.isPending}
                  resolveOptions={resolveOptions}
                />
                {urlLocked && (
                  <Text className='text-xs text-red-600 mt-1'>
                    {t("home.settings.disabled_by_admin")}
                  </Text>
                )}
              </View>
            </View>

            <CustomHeaderSelector
              integrationKey='seerr'
              title={t("custom_headers.title")}
              description={t("custom_headers.integration_description")}
            />
            <View>
              {apiKeyLocked ? (
                <Text className='text-xs opacity-50 mb-2'>
                  {t("home.settings.plugins.seerr.api_key_from_admin", {
                    username: user?.Name,
                  })}
                </Text>
              ) : (
                <>
                  {askPassword ? (
                    <>
                      <Text className='font-bold mb-2'>
                        {t("home.settings.plugins.seerr.password")}
                      </Text>
                      <Input
                        className='border border-neutral-800'
                        autoFocus={true}
                        focusable={true}
                        placeholder={t(
                          "home.settings.plugins.seerr.password_placeholder",
                          { username: user?.Name },
                        )}
                        value={seerrPassword}
                        keyboardType='default'
                        secureTextEntry={true}
                        returnKeyType='done'
                        autoCapitalize='none'
                        textContentType='password'
                        onChangeText={setSeerrPassword}
                        editable={!loginToSeerrMutation.isPending}
                      />
                    </>
                  ) : (
                    <Text className='text-xs opacity-50 mb-2'>
                      {t("home.settings.plugins.seerr.credentials_not_needed")}
                    </Text>
                  )}
                  {askPassword && (
                    <>
                      <Text className='font-bold mb-2 mt-4'>
                        {t("home.settings.plugins.seerr.api_key")}
                      </Text>
                      <Text className='text-xs opacity-50 mb-2'>
                        {t("home.settings.plugins.seerr.api_key_hint")}
                      </Text>
                      <Input
                        className='border border-neutral-800'
                        placeholder={t(
                          "home.settings.plugins.seerr.api_key_placeholder",
                        )}
                        value={seerrApiKeyInput}
                        keyboardType='default'
                        secureTextEntry={true}
                        returnKeyType='done'
                        autoCapitalize='none'
                        autoCorrect={false}
                        onChangeText={setSeerrApiKeyInput}
                        editable={!loginToSeerrMutation.isPending}
                      />
                    </>
                  )}
                </>
              )}
              <Button
                loading={loginToSeerrMutation.isPending}
                disabled={loginToSeerrMutation.isPending}
                color='purple'
                className='h-12 mt-2'
                onPress={() => loginToSeerrMutation.mutate()}
              >
                {apiKeyLocked || seerrApiKeyInput.trim()
                  ? t("home.settings.plugins.seerr.connect_button")
                  : t("home.settings.plugins.seerr.login_button")}
              </Button>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};
