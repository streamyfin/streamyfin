import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import { View } from "react-native";
import { Text } from "../common/Text";
import { useCallback, useRef, useState } from "react";
import { Input } from "../common/Input";
import { ListItem } from "../ListItem";
import { Loader } from "../Loader";
import { useSettings } from "@/utils/atoms/settings";
import { Button } from "../Button";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useAtom } from "jotai";
import { toast } from "sonner-native";
import { useMutation } from "@tanstack/react-query";

export const JellyseerrSettings = () => {
  const {
    jellyseerrApi,
    jellyseerrUser,
    setJellyseerrUser,
    clearAllJellyseerData,
  } = useJellyseerr();

  const [user] = useAtom(userAtom);
  const [settings, updateSettings] = useSettings();

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
      toast.error("Failed to login");
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
    <View className="mt-4">
      <Text className="text-lg font-bold mb-2">Jellyseerr</Text>
      <View>
        {jellyseerrUser ? (
          <View className="flex flex-col rounded-xl overflow-hidden bg-neutral-900 pt-0 divide-y divide-neutral-800">
            <ListItem
              title="Total media requests"
              subTitle={jellyseerrUser?.requestCount?.toString()}
            />
            <ListItem
              title="Movie quota limit"
              subTitle={
                jellyseerrUser?.movieQuotaLimit?.toString() ?? "Unlimited"
              }
            />
            <ListItem
              title="Movie quota days"
              subTitle={
                jellyseerrUser?.movieQuotaDays?.toString() ?? "Unlimited"
              }
            />
            <ListItem
              title="TV quota limit"
              subTitle={jellyseerrUser?.tvQuotaLimit?.toString() ?? "Unlimited"}
            />
            <ListItem
              title="TV quota days"
              subTitle={jellyseerrUser?.tvQuotaDays?.toString() ?? "Unlimited"}
            />
            <View className="p-4">
              <Button color="red" onPress={clearData}>
                Reset Jellyseerr config
              </Button>
            </View>
          </View>
        ) : (
          <View className="flex flex-col rounded-xl overflow-hidden p-4 bg-neutral-900">
            <Text className="text-xs text-red-600 mb-2">
              This integration is in its early stages. Expect things to change.
            </Text>
            <Text className="font-bold mb-1">Server URL</Text>
            <View className="flex flex-col shrink mb-2">
              <Text className="text-xs text-gray-600">
                Example: http(s)://your-host.url
              </Text>
              <Text className="text-xs text-gray-600">
                (add port if required)
              </Text>
            </View>
            <Input
              placeholder="Jellyseerr URL..."
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
              {promptForJellyseerrPass ? "Clear" : "Save"}
            </Button>

            <View
              pointerEvents={promptForJellyseerrPass ? "auto" : "none"}
              style={{
                opacity: promptForJellyseerrPass ? 1 : 0.5,
              }}
            >
              <Text className="font-bold mb-2">Password</Text>
              <Input
                autoFocus={true}
                focusable={true}
                placeholder={`Enter password for Jellyfin user ${user?.Name}`}
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
                Login
              </Button>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};
