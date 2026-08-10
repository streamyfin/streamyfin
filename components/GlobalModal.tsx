import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
} from "@gorhom/bottom-sheet";
import { useCallback, useEffect } from "react";
import { useWindowDimensions } from "react-native";
import { SHEET_MAX_HEIGHT_RATIO } from "@/constants/Values";
import { useGlobalModal } from "@/providers/GlobalModalProvider";

/**
 * GlobalModal Component
 *
 * This component renders a global bottom sheet modal that can be controlled
 * from anywhere in the app using the useGlobalModal hook.
 *
 * Place this component at the root level of your app (in _layout.tsx)
 * after BottomSheetModalProvider.
 */
export const GlobalModal = () => {
  const { hideModal, modalState, modalRef, isVisible } = useGlobalModal();
  // Derived here rather than passed in by callers: this component re-renders on
  // rotation, so a sheet that is already open follows the new window height.
  const { height: windowHeight } = useWindowDimensions();
  const maxDynamicContentSize = windowHeight * SHEET_MAX_HEIGHT_RATIO;

  useEffect(() => {
    if (isVisible && modalState.content) {
      modalRef.current?.present();
    }
  }, [isVisible, modalState.content, modalRef]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        hideModal();
      }
    },
    [hideModal],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  const defaultOptions = {
    enableDynamicSizing: true,
    enablePanDownToClose: true,
    backgroundStyle: {
      backgroundColor: "#171717",
    },
    handleIndicatorStyle: {
      backgroundColor: "white",
    },
  };

  // Merge default options with provided options
  const modalOptions = { ...defaultOptions, ...modalState.options };

  return (
    <BottomSheetModal
      ref={modalRef}
      {...(modalOptions.snapPoints
        ? // Dynamic sizing is on by default and would add a content-height
          // detent next to the requested snap points, so turn it off for
          // callers that ask for fixed heights.
          { snapPoints: modalOptions.snapPoints, enableDynamicSizing: false }
        : {
            enableDynamicSizing: modalOptions.enableDynamicSizing,
            maxDynamicContentSize,
          })}
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={modalOptions.handleIndicatorStyle}
      backgroundStyle={modalOptions.backgroundStyle}
      enablePanDownToClose={modalOptions.enablePanDownToClose}
      enableDismissOnClose
      stackBehavior='push'
      style={{ zIndex: 1000 }}
    >
      {modalState.content}
    </BottomSheetModal>
  );
};
