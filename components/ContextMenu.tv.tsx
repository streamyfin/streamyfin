import React from "react";
import { View } from "react-native";

// Create empty/stub components for TV platform
export const Root = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

export const Trigger = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

export const Content = ({
  children,
  ...props
}: {
  children: React.ReactNode;
  [key: string]: any;
}) => {
  return null; // Don't render context menu content on TV
};

export const Label = ({
  children,
  ...props
}: {
  children: React.ReactNode;
  [key: string]: any;
}) => {
  return null;
};

export const Item = ({
  children,
  ...props
}: {
  children: React.ReactNode;
  [key: string]: any;
}) => {
  return null;
};

export const ItemTitle = ({
  children,
  ...props
}: {
  children: React.ReactNode;
  [key: string]: any;
}) => {
  return null;
};

export const ItemIcon = (props: any) => {
  return null;
};
