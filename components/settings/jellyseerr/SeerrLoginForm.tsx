import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "../../Button";
import { Input } from "../../common/Input";
import { Text } from "../../common/Text";

export interface SeerrCredentials {
  email: string;
  password: string;
}

interface SeerrLoginProps {
  isLoading: boolean;
  onSubmit: (credentials: SeerrCredentials) => void;
}

export const SeerrLogin = ({ isLoading, onSubmit }: SeerrLoginProps) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <View className='flex flex-col space-y-4'>
      <View>
        <Text className='font-bold mb-2'>
          {t("home.settings.plugins.jellyseerr.email")}
        </Text>
        <Input
          className='border border-neutral-800'
          placeholder={t("home.settings.plugins.jellyseerr.email")}
          value={email}
          onChangeText={setEmail}
          editable={!isLoading}
          autoFocus
        />
      </View>
      <View>
        <Text className='font-bold mb-2'>
          {t("home.settings.plugins.jellyseerr.password")}
        </Text>
        <Input
          className='border border-neutral-800'
          placeholder={t("home.settings.plugins.jellyseerr.password")}
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
        disabled={isLoading || !email || !password}
        color='purple'
        className='h-12 mt-2'
        onPress={() => onSubmit({ email, password })}
      >
        {t("home.settings.plugins.jellyseerr.login_button")}
      </Button>
    </View>
  );
};
