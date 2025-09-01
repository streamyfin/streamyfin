import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { Input } from "./common/Input";

interface PasswordInputProps {
  value?: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  className?: string;
  testID?: string;
  accessibilityLabel?: string;
  maxLength?: number;
  showPassword?: boolean;
  onShowPasswordChange?: (show: boolean) => void;
  topPosition?: "3.5" | "4";
  editable?: boolean;
  autoComplete?:
    | "password"
    | "username"
    | "name"
    | "email"
    | "tel"
    | "url"
    | "off";
  autoCorrect?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value = "",
  onChangeText,
  onSubmitEditing,
  placeholder,
  className = "",
  testID,
  accessibilityLabel,
  maxLength = 500,
  showPassword: controlledShowPassword,
  onShowPasswordChange,
  topPosition = "3.5",
  editable = true,
  autoComplete,
  autoCorrect,
}) => {
  const { t } = useTranslation();
  const [internalShowPassword, setInternalShowPassword] = useState(false);

  // Use controlled state if provided, otherwise use internal state
  const showPassword = controlledShowPassword ?? internalShowPassword;
  const setShowPassword = onShowPasswordChange ?? setInternalShowPassword;

  const topClass = topPosition === "4" ? "top-4" : "top-3.5";

  return (
    <View className={`relative ${className}`}>
      <Input
        placeholder={placeholder}
        onChangeText={onChangeText}
        value={value}
        secureTextEntry={!showPassword}
        keyboardType='default'
        returnKeyType='done'
        autoCapitalize='none'
        textContentType='password'
        clearButtonMode='while-editing'
        maxLength={maxLength}
        className='pr-12'
        onSubmitEditing={onSubmitEditing}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        editable={editable}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
      />
      <TouchableOpacity
        onPress={() => setShowPassword(!showPassword)}
        className={`absolute right-3 ${topClass} p-1`}
        accessible={true}
        accessibilityRole='button'
        accessibilityLabel={
          showPassword
            ? t("accessibility.hide_password")
            : t("accessibility.show_password")
        }
        accessibilityHint={t("accessibility.toggle_password_visibility")}
        accessibilityState={{ selected: showPassword }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Ionicons
          name={showPassword ? "eye-off" : "eye"}
          size={24}
          color='white'
        />
      </TouchableOpacity>
    </View>
  );
};
