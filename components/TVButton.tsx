import React, { forwardRef } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { Button, ButtonProps } from "./Button";
import { TVFocusable } from "./common/TVFocusable";

export const TVButton = forwardRef<any, ButtonProps>((props, ref) => {
  const { children, onPress, style, ...rest } = props;

  if (Platform.isTV) {
    return (
      <TVFocusable
        ref={ref}
        onSelect={onPress}
        style={style}
      >
        <Button {...rest} onPress={onPress}>
          {children}
        </Button>
      </TVFocusable>
    );
  }

  return <Button ref={ref} onPress={onPress} style={style} {...rest}>{children}</Button>;
});