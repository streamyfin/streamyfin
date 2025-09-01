import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { TouchableOpacity } from "react-native";
import { Input } from "./common/Input";

// Discriminated union for password visibility control
type PasswordVisibilityControlled = {
  value?: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  showPassword: boolean;
  onShowPasswordChange: (show: boolean) => void;
  topPosition?: string;
  layout?: "tv" | "mobile";
};

type PasswordVisibilityUncontrolled = {
  value?: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  showPassword?: never;
  onShowPasswordChange?: never;
  topPosition?: string;
  layout?: "tv" | "mobile";
};

type PasswordInputProps =
  | PasswordVisibilityControlled
  | PasswordVisibilityUncontrolled;

export const PasswordInput: React.FC<PasswordInputProps> = (props) => {
  const {
    value = "",
    onChangeText,
    placeholder,
    topPosition = "3.5",
    layout = "mobile",
  } = props;

  // Type guard to check if we're in controlled mode
  const isControlled =
    "showPassword" in props && "onShowPasswordChange" in props;

  // For controlled mode, use the provided props
  // For uncontrolled mode, use internal state (but we need to handle this differently)
  const showPassword = isControlled
    ? (props as PasswordVisibilityControlled).showPassword
    : false;

  const handleTogglePassword = () => {
    if (isControlled) {
      (props as PasswordVisibilityControlled).onShowPasswordChange(
        !showPassword,
      );
    }
    // For uncontrolled mode, we could add internal state handling here if needed
  };

  // Generate top position with pixel precision
  const getTopStyle = () => {
    // Use pixel values directly
    const positionInPx = parseFloat(topPosition);
    return { top: positionInPx };
  };

  return (
    <>
      <Input
        placeholder={placeholder}
        onChangeText={onChangeText}
        value={value}
        secureTextEntry={!showPassword}
        className='pr-4'
      />
      <TouchableOpacity
        onPress={handleTogglePassword}
        className={`absolute right-3 p-1 ${
          layout === "tv" ? "h-10 justify-center" : ""
        }`}
        style={getTopStyle()}
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
