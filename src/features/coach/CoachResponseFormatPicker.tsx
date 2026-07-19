import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "../../theme/components";
import type { CoachResponseFormat } from "../../services/coachV2Contract";

const OPTIONS: CoachResponseFormat[] = ["auto", "table", "chart"];

export function CoachResponseFormatPicker({ value, onChange, disabled = false }: {
  value: CoachResponseFormat;
  onChange: (value: CoachResponseFormat) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("coach");
  const id = useId();
  const helperId = `${id}-helper`;
  return <fieldset className="coach-format-picker" aria-describedby={helperId} disabled={disabled}>
    <legend><Text variant="label">{t("responseFormat.label")}</Text></legend>
    <div className="coach-format-picker__options">
      {OPTIONS.map((option) => <label key={option} className="coach-format-picker__option">
        <input type="radio" name={`${id}-response-format`} value={option} checked={value === option}
          onChange={() => onChange(option)} />
        <span>{t(`responseFormat.option.${option}`)}</span>
      </label>)}
    </div>
    <Text id={helperId} as="p" variant="caption" tone="tertiary">{t("responseFormat.helper")}</Text>
  </fieldset>;
}
