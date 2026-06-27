import { useTranslation } from "react-i18next";

interface VisibilityToggleProps {
  value: "public" | "private";
  onChange: (value: "public" | "private") => void;
}

export default function VisibilityToggle({ value, onChange }: VisibilityToggleProps) {
  const { t } = useTranslation("group");
  return (
    <div className="flex gap-3">
      <button
        onClick={() => onChange("private")}
        className={`flex-1 px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)] font-medium border transition-colors ${
          value === "private"
            ? "border-[var(--lime)] bg-[var(--bg-2)] text-[var(--lime)]"
            : "border-[var(--line-soft)] text-[var(--ink-2)]"
        }`}
      >
        {t("create.visibility.private")}
      </button>
      <button
        onClick={() => onChange("public")}
        className={`flex-1 px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)] font-medium border transition-colors ${
          value === "public"
            ? "border-[var(--lime)] bg-[var(--bg-2)] text-[var(--lime)]"
            : "border-[var(--line-soft)] text-[var(--ink-2)]"
        }`}
      >
        {t("create.visibility.public")}
      </button>
    </div>
  );
}
