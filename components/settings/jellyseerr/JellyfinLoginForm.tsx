import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { userAtom } from "@/providers/JellyfinProvider";
import { Button } from "../../Button";
import { Input } from "../../common/Input";
import { Text } from "../../common/Text";

export interface JellyfinCredentials {
  username: string;
  password: string;
}

interface JellyfinLoginProps {
  isLoading: boolean;
  onSubmit: (credentials: JellyfinCredentials) => void;
}

export const JellyfinLogin = ({ isLoading, onSubmit }: JellyfinLoginProps) => {
  const { t } = useTranslation();
  const [user] = useAtom(userAtom);
  const [password, setPassword] = useState("");

  return (
    <View className='flex flex-col space-y-4'>
      <View>
        <Text className='font-bold mb-2'>
          {t("home.settings.plugins.jellyseerr.password")}
        </Text>
        <Input
          className='border border-neutral-800'
          placeholder={t(
            "home.settings.plugins.jellyseerr.password_placeholder",
            { username: user?.Name },
          )}
          value={password}
          secureTextEntry={true}
          returnKeyType='done'
          autoCapitalize='none'
          textContentType='password'
          onChangeText={setPassword}
          editable={!isLoading}
        />
      </View>
      <Button
        loading={isLoading}
        disabled={isLoading || !password}
        color='purple'
        className='h-12 mt-2'
        onPress={() => onSubmit({ username: user?.Name || "", password })}
      >
        {t("home.settings.plugins.jellyseerr.login_button")}
      </Button>
    </View>
  );
};
