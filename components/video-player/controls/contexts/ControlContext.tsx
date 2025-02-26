import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import React, { createContext, useContext, useState, ReactNode } from "react";

interface ControlContextProps {
  item: BaseItemDto;
  mediaSource: MediaSourceInfo | null | undefined;
  isVideoLoaded: boolean | undefined;
}

const ControlContext = createContext<ControlContextProps | undefined>(
  undefined
);

interface ControlProviderProps {
  children: ReactNode;
  item: BaseItemDto;
  mediaSource: MediaSourceInfo | null | undefined;
  isVideoLoaded: boolean | undefined;
}

export const ControlProvider: React.FC<ControlProviderProps> = ({
  children,
  item,
  mediaSource,
  isVideoLoaded,
}) => {
  return (
    <ControlContext.Provider value={{ item, mediaSource, isVideoLoaded }}>
      {children}
    </ControlContext.Provider>
  );
};

export const useControlContext = () => {
  const context = useContext(ControlContext);
  if (context === undefined) {
    throw new Error("useControlContext must be used within a ControlProvider");
  }
  return context;
};
