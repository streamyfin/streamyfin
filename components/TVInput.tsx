import React, { forwardRef, useRef } from 'react';
import { Platform, TextInput, TextInputProps, View } from 'react-native';
import { TVFocusable } from './common/TVFocusable';
import { Input } from './common/Input';

interface TVInputProps extends TextInputProps {
  hasTVPreferredFocus?: boolean;
  nextFocusDown?: React.RefObject<any>;
  nextFocusUp?: React.RefObject<any>;
  nextFocusRight?: React.RefObject<any>;
  nextFocusLeft?: React.RefObject<any>;
}

export const TVInput = forwardRef<TextInput, TVInputProps>((props, ref) => {
  const {
    hasTVPreferredFocus = false,
    style,
    onSubmitEditing,
    nextFocusDown,
    nextFocusUp,
    nextFocusRight,
    nextFocusLeft,
    ...inputProps
  } = props;

  const localInputRef = useRef<TextInput>(null);
  const tvFocusableRef = useRef(null);
  
  // Combine the forwarded ref with our local ref
  const inputRef = (ref || localInputRef) as React.RefObject<TextInput>;

  const handleSelect = () => {
    // When selected with remote, focus the actual input
    inputRef.current?.focus();
  };

  const handleSubmitEditing = (e: any) => {
    // Call the original onSubmitEditing if provided
    if (onSubmitEditing) {
      onSubmitEditing(e);
    }
    
    // If we have a nextFocusDown ref, focus it
    if (Platform.isTV && nextFocusDown?.current) {
      // @ts-ignore - requestTVFocus is not in the type definitions
      nextFocusDown.current.requestTVFocus?.();
    }
  };

  if (Platform.isTV) {
    return (
      <TVFocusable 
        ref={tvFocusableRef}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onSelect={handleSelect}
        style={[
          { borderRadius: 12 }, // Match the Input component's border radius
          style
        ]}
      >
        <Input
          ref={inputRef}
          showSoftInputOnFocus={true}
          onSubmitEditing={handleSubmitEditing}
          {...inputProps}
        />
      </TVFocusable>
    );
  }

  return <Input ref={inputRef} onSubmitEditing={onSubmitEditing} {...inputProps} />;
});