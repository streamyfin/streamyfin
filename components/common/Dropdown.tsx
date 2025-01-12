import * as DropdownMenu from "zeego/dropdown-menu";
import {TouchableOpacity, View, ViewProps} from "react-native";
import {Text} from "@/components/common/Text";
import React, {PropsWithChildren, ReactNode, useEffect, useState} from "react";
import DisabledSetting from "@/components/settings/DisabledSetting";

interface Props<T> {
  data: T[]
  disabled?: boolean
  placeholderText?: string,
  keyExtractor: (item: T) => string
  titleExtractor: (item: T) => string | undefined
  title: string | ReactNode,
  label: string,
  onSelected: (...item: T[]) => void
  multi?: boolean
}

const Dropdown =  <T extends unknown>({
  data,
  disabled,
  placeholderText,
  keyExtractor,
  titleExtractor,
  title,
  label,
  onSelected,
  multi = false,
  ...props
}: PropsWithChildren<Props<T> & ViewProps>) => {
  const [selected, setSelected] = useState<T[]>();

  useEffect(() => {
    if (selected !== undefined) {
      onSelected(...selected)
    }
  }, [selected]);

  return (
    <DisabledSetting
      disabled={disabled === true}
      showText={false}
      {...props}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {typeof title === 'string' ? (
            <View className="flex flex-col">
              <Text className="opacity-50 mb-1 text-xs">
                {title}
              </Text>
              <TouchableOpacity
                className="bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between">
                <Text style={{}} className="" numberOfLines={1}>
                  {selected?.length !== undefined ? selected.map(titleExtractor).join(",") : placeholderText}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {title}
            </>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          loop={false}
          side="bottom"
          align="center"
          alignOffset={0}
          avoidCollisions={true}
          collisionPadding={0}
          sideOffset={0}
        >
          <DropdownMenu.Label>{label}</DropdownMenu.Label>
          {data.map((item, idx) => (
            multi ? (
                <DropdownMenu.CheckboxItem
                  value={selected?.some(s => keyExtractor(s) == keyExtractor(item)) ? 'on' : 'off'}
                  key={keyExtractor(item)}
                  onValueChange={(next, previous) =>
                    setSelected((p) => {
                      const prev = p || []
                      if (next == 'on') {
                        return [...prev, item]
                      }
                      return [...prev.filter(p => keyExtractor(p) !== keyExtractor(item))]
                    })
                  }
                >
                  <DropdownMenu.ItemTitle>{titleExtractor(item)}</DropdownMenu.ItemTitle>
                </DropdownMenu.CheckboxItem>
              )
              : (
                <DropdownMenu.Item
                  key={keyExtractor(item)}
                  onSelect={() => setSelected([item])}
                >
                  <DropdownMenu.ItemTitle>{titleExtractor(item)}</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
              )
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </DisabledSetting>
  )
};

export default Dropdown;