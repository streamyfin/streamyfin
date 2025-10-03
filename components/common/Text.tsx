import { Platform, Text as RNText, type TextProps } from "react-native";

interface CustomTextProps extends TextProps {
  className?: string;
}

export function Text({ className, ...props }: CustomTextProps) {
  if (Platform.isTV)
    return (
      <RNText allowFontScaling={false} className={clsx(className)} {...props} />
    );

  return (
    <RNText allowFontScaling={false} className={clsx(className)} {...props} />
  );
}

const clsx = (className?: string) => {
  const colorClassRegex = /\btext-[a-z]+-\d+\b/;
  const hasColorClass = className ? colorClassRegex.test(className) : false;
  const defaultClassName = "text-white";
  const classes = [
    ...(hasColorClass ? [] : [defaultClassName]),
    ...(className ? [className] : []),
  ]
    .filter(Boolean)
    .join(" ");
  return classes;
};
