import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { BottomSheetModal } from "@/utils/expoUiBottomSheet";

/**
 * GlobalModal Component
 *
 * This component renders a global bottom sheet modal that can be controlled
 * from anywhere in the app using the useGlobalModal hook.
 *
 * Place this component at the root level of your app (in _layout.tsx).
 */
export const GlobalModal = () => {
  const { hideModal, modalState, modalRef, isVisible } = useGlobalModal();

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

  if (Platform.isTV) return null;

  return (
    <BottomSheetModal
      ref={modalRef}
      {...(modalOptions.snapPoints
        ? { snapPoints: modalOptions.snapPoints }
        : { enableDynamicSizing: modalOptions.enableDynamicSizing })}
      onChange={handleSheetChanges}
      handleIndicatorStyle={modalOptions.handleIndicatorStyle}
      backgroundStyle={modalOptions.backgroundStyle}
      enablePanDownToClose={modalOptions.enablePanDownToClose}
      style={{ zIndex: 1000 }}
    >
      {modalState.content}
    </BottomSheetModal>
  );
};
