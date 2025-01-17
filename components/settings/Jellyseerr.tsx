import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import { userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { useState } from "react";
import { View } from "react-native";
import { toast } from "sonner-native";
import { Button } from "../Button";
import { Input } from "../common/Input";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const JellyseerrSettings = () => {
  const {
    jellyseerrApi,
    jellyseerrUser,
    setJellyseerrUser,
    clearAllJellyseerData,
  } = useJellyseerr();

  const { t } = useTranslation();

  const [user] = useAtom(userAtom);
  const [settings, updateSettings, pluginSettings] = useSettings();

  const [promptForJellyseerrPass, setPromptForJellyseerrPass] =
    useState<boolean>(false);

  const [jellyseerrPassword, setJellyseerrPassword] = useState<
    string | undefined
  >(undefined);

  const [jellyseerrServerUrl, setjellyseerrServerUrl] = useState<
    string | undefined
  >(settings?.jellyseerrServerUrl || undefined);

  const loginToJellyseerrMutation = useMutation({
    mutationFn: async () => {
      if (!jellyseerrServerUrl || !user?.Name || !jellyseerrPassword) {
        throw new Error("Missing required information for login");
      }
      const jellyseerrTempApi = new JellyseerrApi(jellyseerrServerUrl);
      return jellyseerrTempApi.login(user.Name, jellyseerrPassword);
    },
    onSuccess: (user) => {
      setJellyseerrUser(user);
      updateSettings({ jellyseerrServerUrl });
    },
    onError: () => {
      toast.error(t("jellyseerr.failed_to_login"));
    },
    onSettled: () => {
      setJellyseerrPassword(undefined);
    },
  });

  const testJellyseerrServerUrlMutation = useMutation({
    mutationFn: async () => {
      if (!jellyseerrServerUrl || jellyseerrApi) return null;
      const jellyseerrTempApi = new JellyseerrApi(jellyseerrServerUrl);
      return jellyseerrTempApi.test();
    },
    onSuccess: (result) => {
      if (result && result.isValid) {
        if (result.requiresPass) {
          setPromptForJellyseerrPass(true);
        } else {
          updateSettings({ jellyseerrServerUrl });
        }
      } else {
        setPromptForJellyseerrPass(false);
        setjellyseerrServerUrl(undefined);
        clearAllJellyseerData();
      }
    },
  });

  const clearData = () => {
    clearAllJellyseerData().finally(() => {
      setjellyseerrServerUrl(undefined);
      setPromptForJellyseerrPass(false);
    });
  };

  return (
    <View className="">
      <View>
        {jellyseerrUser ? (
          <>
            <ListGroup title={"Jellyseerr"}>
              <ListItem
                title={t("home.settings.plugins.jellyseerr.total_media_requests")}
                value={jellyseerrUser?.requestCount?.toString()}
              />
              <ListItem
                title={t("home.settings.plugins.jellyseerr.movie_quota_limit")}
                value={
                  jellyseerrUser?.movieQuotaLimit?.toString() ?? t("home.settings.plugins.jellyseerr.unlimited")
                }
              />
              <ListItem
                title={t("home.settings.plugins.jellyseerr.movie_quota_days")}
                value={
                  jellyseerrUser?.movieQuotaDays?.toString() ?? t("home.settings.plugins.jellyseerr.unlimited")
                }
              />
              <ListItem
                title={t("home.settings.plugins.jellyseerr.tv_quota_limit")}
                value={jellyseerrUser?.tvQuotaLimit?.toString() ?? t("home.settings.plugins.jellyseerr.unlimited")}
              />
              <ListItem
                title={t("home.settings.plugins.jellyseerr.tv_quota_days")}
                value={jellyseerrUser?.tvQuotaDays?.toString() ?? t("home.settings.plugins.jellyseerr.unlimited")}
              />
            </ListGroup>

            <View className="p-4">
              <Button color="red" onPress={clearData}>
                {t("home.settings.plugins.jellyseerr.reset_jellyseerr_config_button")}
              </Button>
            </View>
          </>
        ) : (
          <View className="flex flex-col rounded-xl overflow-hidden p-4 bg-neutral-900">
            <Text className="text-xs text-red-600 mb-2">
              {t("home.settings.plugins.jellyseerr.jellyseerr_warning")}
            </Text>
            <Text className="font-bold mb-1">{t("home.settings.plugins.jellyseerr.server_url")}</Text>
            <View className="flex flex-col shrink mb-2">
              <Text className="text-xs text-gray-600">
                {t("home.settings.plugins.jellyseerr.server_url_hint")}
              </Text>
            </View>
            <Input
              placeholder={t("home.settings.plugins.jellyseerr.server_url_placeholder")}
              value={settings?.jellyseerrServerUrl ?? jellyseerrServerUrl}
              defaultValue={
                settings?.jellyseerrServerUrl ?? jellyseerrServerUrl
              }
              keyboardType="url"
              returnKeyType="done"
              autoCapitalize="none"
              textContentType="URL"
              onChangeText={setjellyseerrServerUrl}
              editable={!testJellyseerrServerUrlMutation.isPending}
            />

            <Button
              loading={testJellyseerrServerUrlMutation.isPending}
              disabled={testJellyseerrServerUrlMutation.isPending}
              color={promptForJellyseerrPass ? "red" : "purple"}
              className="h-12 mt-2"
              onPress={() => {
                if (promptForJellyseerrPass) {
                  clearData();
                  return;
                }

                testJellyseerrServerUrlMutation.mutate();
              }}
              style={{
                marginBottom: 8,
              }}
            >
              {promptForJellyseerrPass ? t("home.settings.plugins.jellyseerr.clear_button") : t("home.settings.plugins.jellyseerr.save_button")}
            </Button>

            <View
              pointerEvents={promptForJellyseerrPass ? "auto" : "none"}
              style={{
                opacity: promptForJellyseerrPass ? 1 : 0.5,
              }}
            >
              <Text className="font-bold mb-2">{t("home.settings.plugins.jellyseerr.password")}</Text>
              <Input
                autoFocus={true}
                focusable={true}
                placeholder={t("home.settings.plugins.jellyseerr.password_placeholder", {username: user?.Name})}
                value={jellyseerrPassword}
                keyboardType="default"
                secureTextEntry={true}
                returnKeyType="done"
                autoCapitalize="none"
                textContentType="password"
                onChangeText={setJellyseerrPassword}
                editable={
                  !loginToJellyseerrMutation.isPending &&
                  promptForJellyseerrPass
                }
              />
              <Button
                loading={loginToJellyseerrMutation.isPending}
                disabled={loginToJellyseerrMutation.isPending}
                color="purple"
                className="h-12 mt-2"
                onPress={() => loginToJellyseerrMutation.mutate()}
              >
                {t("home.settings.plugins.jellyseerr.login_button")}
              </Button>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};
