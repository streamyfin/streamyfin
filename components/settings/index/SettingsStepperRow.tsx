import type React from "react";
import { Stepper } from "@/components/inputs/Stepper";
import { ListItem } from "@/components/list/ListItem";

interface Props {
  title: string;
  subtitle?: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onUpdate: (value: number) => void;
  appendValue?: string;
  disabled?: boolean;
}

export const SettingsStepperRow: React.FC<Props> = ({
  title,
  subtitle,
  value,
  step,
  min,
  max,
  onUpdate,
  appendValue,
  disabled,
}) => (
  <ListItem title={title} subtitle={subtitle} disabled={disabled}>
    <Stepper
      value={value}
      step={step}
      min={min}
      max={max}
      onUpdate={onUpdate}
      appendValue={appendValue}
      disabled={disabled}
    />
  </ListItem>
);
