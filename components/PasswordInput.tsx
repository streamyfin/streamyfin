import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity } from "react-native";
import { Input } from "./common/Input";

// Discriminated union for password visibility control
type PasswordVisibilityControlled = {
  value?: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  showPassword: boolean;
  onShowPasswordChange: (show: boolean) => void;
  topOffset?: number;
  layout?: "tv" | "mobile";
};

type PasswordVisibilityUncontrolled = {
  value?: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  showPassword?: never;
  onShowPasswordChange?: never;
  topOffset?: number;
  layout?: "tv" | "mobile";
  defaultShowPassword?: boolean;
};

type PasswordInputProps =
  | PasswordVisibilityControlled
  | PasswordVisibilityUncontrolled;

export const PasswordInput: React.FC<PasswordInputProps> = (props) => {
  const { t } = useTranslation();
  const {
    value = "",
    onChangeText,
    placeholder,
    topOffset = 14, // Default 14px for mobile
    layout = "mobile",
  } = props;

  // Type guard to check if we're in controlled mode
  const isControlled =
    "showPassword" in props && "onShowPasswordChange" in props;

  // Internal state for uncontrolled mode
  const [internalShowPassword, setInternalShowPassword] = useState(() =>
    !isControlled && "defaultShowPassword" in props
      ? ((props as PasswordVisibilityUncontrolled).defaultShowPassword ?? false)
      : false,
  );

  // Use controlled value if available, otherwise use internal state
  const showPassword = isControlled
    ? (props as PasswordVisibilityControlled).showPassword
    : internalShowPassword;

  const handleTogglePassword = () => {
    if (isControlled) {
      (props as PasswordVisibilityControlled).onShowPasswordChange(
        !showPassword,
      );
    } else {
      // For uncontrolled mode, toggle internal state
      setInternalShowPassword(!showPassword);
    }
  };

  // Generate top position style with validation
  const getTopStyle = () => {
    if (typeof topOffset !== "number" || Number.isNaN(topOffset)) {
      console.warn(`Invalid topOffset value: ${topOffset}`);
      return { top: 14 }; // Default fallback (14px for mobile)
    }
    return { top: topOffset };
  };

  return (
    <>
      <Input
        placeholder={placeholder}
        onChangeText={onChangeText}
        value={value}
        secureTextEntry={!showPassword}
        extraClassName='pr-4'
      />
      <TouchableOpacity
        onPress={handleTogglePassword}
        className={`absolute right-3 p-1 ${
          layout === "tv" ? "h-10 justify-center" : ""
        }`}
        style={getTopStyle()}
        accessible={true}
        accessibilityRole='button'
        accessibilityLabel={
          showPassword ? t("login.hide_password") : t("login.show_password")
        }
        accessibilityHint={t("login.toggle_password_visibility")}
        accessibilityState={{ checked: showPassword }}
      >
        <Ionicons
          name={showPassword ? "eye-off" : "eye"}
          size={24}
          color='white'
        />
      </TouchableOpacity>
    </>
  );
};
