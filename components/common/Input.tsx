import React, { useEffect } from "react";
import { TextInput, TextInputProps } from "react-native";

type AutoFocusDelayProps = {
  /**
   * If true, focuses the input after the given amount of ms on componentDidMount.
   * The default value is false.
   */
  autoFocusDelay?: number
}

export function Input(props: TextInputProps & AutoFocusDelayProps) {
  const { style, ...otherProps } = props;
  const inputRef = React.useRef<TextInput>(null);

  if(props.autoFocus && props.autoFocusDelay) {
    console.warn('autoFocusDelay is obsolete when using autoFocus');
  }

  // focus the input after the given amount of ms
  useEffect(() => {
    if(!props.autoFocusDelay) return;
    const timer = setTimeout(() => {
      if(inputRef.current) {
        inputRef.current.focus();
      }
    }, props.autoFocusDelay);
    return () => clearTimeout(timer);
  }, [])

  return (
    <TextInput
      ref={inputRef}
      className="p-4  rounded-xl bg-neutral-900"
      allowFontScaling={false}
      style={[{ color: "white" }, style]}
      placeholderTextColor={"#9CA3AF"}
      clearButtonMode="while-editing"
      {...otherProps}
    />
  );
}
