import { useMutation } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { toast } from "sonner-native";
import { SeerrApi, useSeerr } from "@/hooks/useSeerr";
import { userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { Button } from "../Button";
import { Input } from "../common/Input";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const SeerrSettings = () => {
  const { seerrUser, setSeerrUser, clearAllSeerrData } = useSeerr();

  const { t } = useTranslation();

  const [user] = useAtom(userAtom);
  const { settings, updateSettings } = useSettings();

  const [seerrPassword, setSeerrPassword] = useState<string | undefined>(
    undefined,
  );

  const [seerrServerUrl, setSeerrServerUrl] = useState<string | undefined>(
    settings?.seerrServerUrl || undefined,
  );

  const loginToSeerrMutation = useMutation({
    mutationFn: async () => {
      if (!seerrServerUrl && !settings?.seerrServerUrl)
        throw new Error("Missing server url");
      if (!user?.Name)
        throw new Error("Missing required information for login");
      const seerrTempApi = new SeerrApi(
        seerrServerUrl || settings.seerrServerUrl || "",
      );
      const testResult = await seerrTempApi.test();
      if (!testResult.isValid) throw new Error("Invalid server url");
      return seerrTempApi.login(user.Name, seerrPassword || "");
    },
    onSuccess: (user) => {
      setSeerrUser(user);
      updateSettings({ seerrServerUrl });
    },
    onError: () => {
      toast.error(t("seerr.failed_to_login"));
    },
    onSettled: () => {
      setSeerrPassword(undefined);
    },
  });

  const clearData = () => {
    clearAllSeerrData().finally(() => {
      setSeerrUser(undefined);
      setSeerrPassword(undefined);
      setSeerrServerUrl(undefined);
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

            <View className='p-4'>
              <Button color='red' onPress={clearData}>
                {t("home.settings.plugins.seerr.reset_seerr_config_button")}
              </Button>
            </View>
          </>
        ) : (
          <View className='flex flex-col rounded-xl overflow-hidden p-4 bg-neutral-900'>
            <Text className='text-xs text-red-600 mb-2'>
              {t("home.settings.plugins.seerr.seerr_warning")}
            </Text>
            <Text className='font-bold mb-1'>
              {t("home.settings.plugins.seerr.server_url")}
            </Text>
            <View className='flex flex-col shrink mb-2'>
              <Text className='text-xs text-gray-600'>
                {t("home.settings.plugins.seerr.server_url_hint")}
              </Text>
            </View>
            <Input
              className='border border-neutral-800 mb-2'
              placeholder={t(
                "home.settings.plugins.seerr.server_url_placeholder",
              )}
              value={seerrServerUrl ?? settings?.seerrServerUrl}
              defaultValue={settings?.seerrServerUrl ?? seerrServerUrl}
              keyboardType='url'
              returnKeyType='done'
              autoCapitalize='none'
              textContentType='URL'
              onChangeText={setSeerrServerUrl}
              editable={!loginToSeerrMutation.isPending}
            />
            <View>
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
              <Button
                loading={loginToSeerrMutation.isPending}
                disabled={loginToSeerrMutation.isPending}
                color='purple'
                className='h-12 mt-2'
                onPress={() => loginToSeerrMutation.mutate()}
              >
                {t("home.settings.plugins.seerr.login_button")}
              </Button>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};
