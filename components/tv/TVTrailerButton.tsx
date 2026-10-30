import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import React, { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { View } from "react-native";
import { TV_MODAL_FOCUS_RESTORE_MS } from "@/constants/Values";
import { useTrailers } from "@/hooks/useTrailers";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { tvOptionModalAtom } from "@/utils/atoms/tvOptionModal";
import { type Trailer, trailerLabels } from "@/utils/jellyfin/media/trailers";
import { scaleSize } from "@/utils/scaleSize";
import { TVButton } from "./TVButton";

export interface TVTrailerButtonProps {
  item: BaseItemDto;
  disabled?: boolean;
}

/** Press plays the preferred trailer, holding select lists every one. */
export const TVTrailerButton: React.FC<TVTrailerButtonProps> = ({
  item,
  disabled,
}) => {
  const { t } = useTranslation();
  const { trailers, playTrailer } = useTrailers(item);
  const { showOptions } = useTVOptionModal();
  const modalState = useAtomValue(tvOptionModalAtom);
  const buttonRef = useRef<View | null>(null);
  const pickerOpenRef = useRef(false);
  const pickedRef = useRef<Trailer | null>(null);
  // A new playTrailer must not cancel the pending play below.
  const playTrailerRef = useRef(playTrailer);
  playTrailerRef.current = playTrailer;

  // Once the list's route has left the screen: play what was picked (the
  // player pushed from under a modal route is swallowed), or, dismissed,
  // hand the focus back, as Android TV focuses nothing after a modal closes.
  useEffect(() => {
    if (modalState || !pickerOpenRef.current) return;
    pickerOpenRef.current = false;
    const timer = setTimeout(() => {
      const picked = pickedRef.current;
      pickedRef.current = null;
      if (picked) playTrailerRef.current(picked);
      else (buttonRef.current as any)?.requestTVFocus?.();
    }, TV_MODAL_FOCUS_RESTORE_MS);
    return () => clearTimeout(timer);
  }, [modalState]);

  const chooseTrailer = useCallback(() => {
    pickerOpenRef.current = true;
    pickedRef.current = null;
    const labels = trailerLabels(t, trailers);
    showOptions<Trailer>({
      title: t("item_card.choose_trailer"),
      options: trailers.map((trailer, i) => ({
        label: labels[i],
        value: trailer,
        selected: false,
      })),
      onSelect: (trailer) => {
        pickedRef.current = trailer;
      },
    });
  }, [trailers, showOptions, t]);

  if (trailers.length === 0) return null;

  return (
    <TVButton
      onPress={() => playTrailer(trailers[0])}
      onLongPress={chooseTrailer}
      variant='glass'
      square
      disabled={disabled}
      refSetter={(ref) => {
        buttonRef.current = ref;
      }}
    >
      <Ionicons name='film-outline' size={scaleSize(28)} color='#FFFFFF' />
    </TVButton>
  );
};
