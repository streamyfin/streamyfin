import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
} from "@gorhom/bottom-sheet";
import { useCallback } from "react";
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
  const { hideModal, modalState, modalRef } = useGlobalModal();

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
        ? { snapPoints: modalOptions.snapPoints }
        : { enableDynamicSizing: modalOptions.enableDynamicSizing })}
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
