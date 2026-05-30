import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import NitroCookies from "react-native-nitro-cookies";
import { toast } from "sonner-native";
import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import { useSettings } from "@/utils/atoms/settings";
import { Button } from "../../Button";
import { Input } from "../../common/Input";
import { Text } from "../../common/Text";
import { ListGroup } from "../../list/ListGroup";
import { ListItem } from "../../list/ListItem";
import { AuthMethod, JellyseerrAuthSelector } from "./AuthSelector";
import { JellyfinCredentials, JellyfinLogin } from "./JellyfinLoginForm";
import { SeerrCredentials, SeerrLogin } from "./SeerrLoginForm";
import { WebLoginForm } from "./WebLoginForm";

interface WebCredentials {
  cookies: string[];
}

export const JellyseerrSettings = () => {
  const { jellyseerrUser, setJellyseerrUser, clearAllJellyseerData } =
    useJellyseerr();
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();

  const [authMethod, setAuthMethod] = useState<AuthMethod>(AuthMethod.JELLYFIN);
  const [jellyseerrServerUrl, setJellyseerrServerUrl] = useState<
    string | undefined
  >(settings?.jellyseerrServerUrl || undefined);

  const loginToJellyseerrMutation = useMutation({
    mutationFn: async (
      credentials: JellyfinCredentials | SeerrCredentials | WebCredentials,
    ) => {
      if (!jellyseerrServerUrl && !settings.jellyseerrServerUrl)
        throw new Error("Missing server url");

      const jellyseerrApi = new JellyseerrApi(
        jellyseerrServerUrl || settings.jellyseerrServerUrl || "",
      );

      if (!(await jellyseerrApi.test()).isValid)
        throw new Error("Invalid server url");

      switch (authMethod) {
        case AuthMethod.JELLYFIN:
          return jellyseerrApi.jellyfinLogin(
            (credentials as JellyfinCredentials).username,
            (credentials as JellyfinCredentials).password,
          );
        case AuthMethod.SEERR:
          return jellyseerrApi.seerrLogin(
            (credentials as SeerrCredentials).email,
            (credentials as SeerrCredentials).password,
          );
        case AuthMethod.WEB:
          return jellyseerrApi.webLogin(
            (credentials as WebCredentials).cookies,
          );
      }
    },
    onSuccess: (user) => {
      setJellyseerrUser(user);
      updateSettings({
        jellyseerrServerUrl:
          jellyseerrServerUrl || settings?.jellyseerrServerUrl,
      });
    },
    onError: () => {
      toast.error(t("jellyseerr.failed_to_login"));
    },
  });

  const clearData = () => {
    clearAllJellyseerData().finally(async () => {
      setJellyseerrUser(undefined);

      if (jellyseerrServerUrl) {
        // Expire the authentication cookie set when logging in to jellyfin web ui
        const expireHeader =
          "connect.sid=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly";
        await NitroCookies.setFromResponse(jellyseerrServerUrl, expireHeader);
        await NitroCookies.flush();
      }
    });
  };

  const renderAuthForm = () => {
    switch (authMethod) {
      case AuthMethod.JELLYFIN:
        return (
          <JellyfinLogin
            isLoading={loginToJellyseerrMutation.isPending}
            onSubmit={(creds) => loginToJellyseerrMutation.mutate(creds)}
          />
        );
      case AuthMethod.SEERR:
        return (
          <SeerrLogin
            isLoading={loginToJellyseerrMutation.isPending}
            onSubmit={(creds) => loginToJellyseerrMutation.mutate(creds)}
          />
        );
      case AuthMethod.WEB:
        return (
          <WebLoginForm
            serverUrl={jellyseerrServerUrl}
            onSubmit={(creds) => loginToJellyseerrMutation.mutate(creds)}
          />
        );
    }
  };

  return (
    <View className=''>
      <Text className='text-xs text-red-600 mb-4'>
        {t("home.settings.plugins.jellyseerr.jellyseerr_warning")}
      </Text>
      <ListGroup title={t("home.settings.plugins.jellyseerr.server_url")}>
        <Input
          className='bg-transparent px-4 py-3'
          placeholder={t(
            "home.settings.plugins.jellyseerr.server_url_placeholder",
          )}
          value={jellyseerrServerUrl || ""}
          keyboardType='url'
          returnKeyType='done'
          autoCapitalize='none'
          textContentType='URL'
          onChangeText={setJellyseerrServerUrl}
          editable={!loginToJellyseerrMutation.isPending && !jellyseerrUser}
        />
      </ListGroup>
      {jellyseerrUser ? (
        <>
          <ListGroup title={"Seerr Statistics"}>
            <ListItem
              title={t("home.settings.plugins.jellyseerr.total_media_requests")}
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
        <View className='flex flex-col'>
          <JellyseerrAuthSelector
            selection={authMethod}
            onSelect={setAuthMethod}
          />

          <View className='mx-4 mt-2 p-4 rounded-xl bg-neutral-900'>
            {renderAuthForm()}
          </View>
        </View>
      )}
    </View>
  );
};
