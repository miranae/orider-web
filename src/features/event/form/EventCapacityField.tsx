import { useTranslation } from "react-i18next";
import { DropdownSelect, Input } from "../../../theme/components";
import { fieldStyle } from "./eventFormControls";

export function EventCapacityField({ id, value, onChange }: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation("event");
  return <div>
    <DropdownSelect id={id} label={t("create.categoryCapacity")} value={value === 0 ? "unlimited" : "limited"}
      onChange={(mode) => onChange(mode === "unlimited" ? 0 : value || 50)}
      options={[
        { value: "unlimited", label: t("capacity.unlimited") },
        { value: "limited", label: t("capacity.limited") },
      ]} />
    {value !== 0 && <Input type="number" min={1} step={1} value={value}
      aria-label={t("create.categoryCapacity")}
      onChange={(e) => {
        const next = Number(e.target.value);
        if (Number.isSafeInteger(next) && next > 0) onChange(next);
      }} style={fieldStyle} />}
  </div>;
}
