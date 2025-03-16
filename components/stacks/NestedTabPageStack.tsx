import type { ParamListBase, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { HeaderBackButton } from "../common/HeaderBackButton";

type ICommonScreenOptions =
  | NativeStackNavigationOptions
  | ((prop: {
      route: RouteProp<ParamListBase, string>;
      navigation: any;
    }) => NativeStackNavigationOptions);

export const commonScreenOptions: ICommonScreenOptions = {
  title: "",
  headerShown: true,
  headerTransparent: true,
  headerShadowVisible: false,
  headerLeft: () => <HeaderBackButton />,
};

const routes = ["actors/[actorId]", "items/page", "series/[id]"];

export const nestedTabPageScreenOptions: Record<string, ICommonScreenOptions> =
  Object.fromEntries(routes.map((route) => [route, commonScreenOptions]));
