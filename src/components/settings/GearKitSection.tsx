/**
 * 바이크 킷 장비 목록 + 추가/수정/삭제 (#286).
 * PaneEquipment 하단에 렌더링됨.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bike as BikeIcon,
  CircleDot,
  Zap,
  Package,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";

import type { Gear } from "@shared/types";
import type { GearInput } from "../../hooks/useGear";
import { useGear } from "../../hooks/useGear";
import { useToast } from "../../contexts/ToastContext";
import { Button, Text } from "../../theme/components";
import {
  SettingsCard,
  Field,
  FieldGrid,
  fieldInputStyle,
  monoInputStyle,
} from "./_primitives";

// ── 아이콘 매핑 ──────────────────────────────────────────────────────
const TYPE_ICON: Record<Gear["type"], typeof BikeIcon> = {
  bike: BikeIcon,
  wheel: CircleDot,
  powermeter: Zap,
  other: Package,
};

// ── 빈 폼 상태 ──────────────────────────────────────────────────────
const EMPTY_FORM: GearInput = {
  name: "",
  type: "bike",
  brand: "",
  model: "",
  weightKg: undefined,
  isDefault: false,
  cda: undefined,
  crr: undefined,
  drivetrainEfficiency: undefined,
};

// ── 장비 폼 모달 ─────────────────────────────────────────────────────
interface GearFormModalProps {
  initial: GearInput;
  title: string;
  onSave: (input: GearInput) => Promise<void>;
  onClose: () => void;
}

function GearFormModal({ initial, title, onSave, onClose }: GearFormModalProps) {
  const { t } = useTranslation("settings");
  const { showToast } = useToast();
  const [form, setForm] = useState<GearInput>(initial);
  const [busy, setBusy] = useState(false);
  const [showPhysics, setShowPhysics] = useState(
    !!(initial.cda || initial.crr || initial.drivetrainEfficiency),
  );

  function patch(p: Partial<GearInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast(t("gear.fieldNamePlaceholder"));
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...form, name: form.name.trim() });
      onClose();
    } catch (e) {
      showToast(t("gear.saveFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "color-mix(in oklch, var(--ink-0) 45%, transparent)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--line-soft)",
          borderRadius: "var(--r-lg)",
          padding: "var(--space-6)",
          width: 440,
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-5)" }}>
          <Text variant="title">{title}</Text>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("gear.cancel")}>
            ✕
          </Button>
        </div>

        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          {/* 이름 */}
          <Field label={t("gear.fieldName")}>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={t("gear.fieldNamePlaceholder")}
              disabled={busy}
              style={fieldInputStyle}
            />
          </Field>

          {/* 종류 */}
          <Field label={t("gear.fieldType")}>
            <select
              value={form.type}
              onChange={(e) => patch({ type: e.target.value as Gear["type"] })}
              disabled={busy}
              style={fieldInputStyle}
            >
              <option value="bike">{t("gear.typeBike")}</option>
              <option value="wheel">{t("gear.typeWheel")}</option>
              <option value="powermeter">{t("gear.typePowermeter")}</option>
              <option value="other">{t("gear.typeOther")}</option>
            </select>
          </Field>

          <FieldGrid cols={2}>
            {/* 브랜드 */}
            <Field label={t("gear.fieldBrand")}>
              <input
                value={form.brand ?? ""}
                onChange={(e) => patch({ brand: e.target.value })}
                placeholder={t("gear.fieldBrandPlaceholder")}
                disabled={busy}
                style={fieldInputStyle}
              />
            </Field>
            {/* 모델 */}
            <Field label={t("gear.fieldModel")}>
              <input
                value={form.model ?? ""}
                onChange={(e) => patch({ model: e.target.value })}
                placeholder={t("gear.fieldModelPlaceholder")}
                disabled={busy}
                style={fieldInputStyle}
              />
            </Field>
            {/* 무게 */}
            <Field label={t("gear.fieldWeight")} hint="kg">
              <input
                type="number"
                step="0.1"
                min={0.1}
                max={99}
                value={form.weightKg ?? ""}
                onChange={(e) => patch({ weightKg: e.target.value ? Number(e.target.value) : undefined })}
                disabled={busy}
                style={monoInputStyle}
              />
            </Field>
          </FieldGrid>

          {/* 기본 장비 */}
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.isDefault ?? false}
              onChange={(e) => patch({ isDefault: e.target.checked })}
              disabled={busy}
            />
            <Text variant="label">{t("gear.fieldIsDefault")}</Text>
          </label>

          {/* 고급 물리 파라미터 (bike 한정) */}
          {form.type === "bike" && (
            <div>
              <button
                type="button"
                onClick={() => setShowPhysics((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "var(--space-1) 0",
                  color: "var(--ink-2)",
                  fontSize: "var(--fs-sm)",
                }}
              >
                {showPhysics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {t("gear.physicsSection")}
              </button>
              {showPhysics && (
                <div
                  style={{
                    marginTop: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    borderRadius: "var(--r-md)",
                    background: "var(--bg-2)",
                    border: "1px solid var(--line-soft)",
                    display: "grid",
                    gap: "var(--space-3)",
                  }}
                >
                  <Text variant="caption" style={{ color: "var(--ink-3)" }}>
                    {t("gear.physicsSectionHint")}
                  </Text>
                  <FieldGrid cols={2}>
                    <Field label={t("gear.fieldCda")} hint={t("gear.fieldCdaHint")}>
                      <input
                        type="number"
                        step="0.01"
                        min={0.15}
                        max={0.5}
                        value={form.cda ?? ""}
                        onChange={(e) => patch({ cda: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="0.32"
                        disabled={busy}
                        style={monoInputStyle}
                      />
                    </Field>
                    <Field label={t("gear.fieldCrr")} hint={t("gear.fieldCrrHint")}>
                      <input
                        type="number"
                        step="0.001"
                        min={0.001}
                        max={0.05}
                        value={form.crr ?? ""}
                        onChange={(e) => patch({ crr: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="0.004"
                        disabled={busy}
                        style={monoInputStyle}
                      />
                    </Field>
                    <Field label={t("gear.fieldDrivetrain")} hint={t("gear.fieldDrivetrainHint")} full>
                      <input
                        type="number"
                        step="0.01"
                        min={0.8}
                        max={1}
                        value={form.drivetrainEfficiency ?? ""}
                        onChange={(e) => patch({ drivetrainEfficiency: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="0.97"
                        disabled={busy}
                        style={monoInputStyle}
                      />
                    </Field>
                  </FieldGrid>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-5)" }}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t("gear.cancel")}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={busy}>
            {t("gear.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 장비 행 ──────────────────────────────────────────────────────────
interface GearRowProps {
  gear: Gear;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onSetDefault: () => Promise<void>;
}

function GearRow({ gear, onEdit, onDelete, onSetDefault }: GearRowProps) {
  const { t } = useTranslation("settings");
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const Icon = TYPE_ICON[gear.type] ?? Package;

  async function handleDelete() {
    if (!window.confirm(t("gear.deleteConfirm", { name: gear.name }))) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (e) {
      showToast(t("gear.deleteFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetDefault() {
    setBusy(true);
    try {
      await onSetDefault();
    } catch (e) {
      showToast(t("gear.saveFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr auto",
        gap: "var(--space-3)",
        alignItems: "center",
        padding: "var(--space-3) 0",
        borderTop: "1px solid var(--line-soft)",
      }}
    >
      {/* 아이콘 */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "var(--r-md)",
          background: gear.isDefault
            ? "color-mix(in oklch, var(--lime) 12%, var(--bg-2))"
            : "var(--bg-2)",
          display: "grid",
          placeItems: "center",
          color: gear.isDefault ? "var(--lime)" : "var(--ink-2)",
          flexShrink: 0,
        }}
      >
        <Icon size={18} />
      </div>

      {/* 이름 + 부가 정보 */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Text
            variant="body"
            style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {gear.name}
          </Text>
          {gear.isDefault && (
            <span
              style={{
                fontSize: "var(--fs-xs)",
                padding: "1px var(--space-2)",
                borderRadius: "var(--r-full)",
                background: "var(--lime)",
                color: "var(--primary-fg)",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {t("gear.defaultBadge")}
            </span>
          )}
        </div>
        <Text
          variant="caption"
          style={{
            color: "var(--ink-3)",
            marginTop: "var(--space-1)",
            fontFamily: "var(--font-mono)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {[gear.brand, gear.model].filter(Boolean).join(" · ")}
          {gear.weightKg ? ` · ${gear.weightKg}kg` : ""}
          {gear.type === "bike" && gear.cda ? ` · CdA ${gear.cda}` : ""}
        </Text>
      </div>

      {/* 액션 버튼 */}
      <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
        {!gear.isDefault && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSetDefault}
            disabled={busy}
            aria-label={t("gear.setDefault")}
            title={t("gear.setDefault")}
          >
            <Star size={12} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          disabled={busy}
          aria-label={t("gear.edit")}
        >
          <Pencil size={12} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={busy}
          aria-label={t("gear.delete")}
          style={{ color: "var(--rose)" }}
        >
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  );
}

// ── 메인 섹션 ────────────────────────────────────────────────────────
interface GearKitSectionProps {
  uid: string;
}

export function GearKitSection({ uid }: GearKitSectionProps) {
  const { t } = useTranslation("settings");
  const { items, loading, addGear, updateGear, removeGear } = useGear(uid);
  const [modalState, setModalState] = useState<
    | { mode: "add" }
    | { mode: "edit"; gear: Gear }
    | null
  >(null);

  async function handleSetDefault(id: string) {
    // 기존 기본 장비 해제 후 신규 기본 설정
    const prev = items.find((g) => g.isDefault && g.id !== id);
    if (prev) await updateGear(prev.id, { isDefault: false });
    await updateGear(id, { isDefault: true });
  }

  if (loading) {
    return (
      <SettingsCard title={t("gear.title")}>
        <div style={{ padding: "var(--space-3)", color: "var(--ink-3)" }}>
          {t("equipment.bikeLoading")}
        </div>
      </SettingsCard>
    );
  }

  return (
    <>
      <SettingsCard
        title={t("gear.title")}
        action={
          <Button variant="secondary" size="sm" onClick={() => setModalState({ mode: "add" })}>
            <Plus size={13} />
            {t("gear.addBtn")}
          </Button>
        }
      >
        <Text variant="caption" style={{ color: "var(--ink-3)", marginBottom: "var(--space-3)", display: "block" }}>
          {t("gear.titleHint")}
        </Text>

        {items.length === 0 ? (
          <div style={{ padding: "var(--space-4) 0", color: "var(--ink-3)", textAlign: "center" }}>
            <Text variant="body" style={{ color: "var(--ink-3)" }}>{t("gear.empty")}</Text>
          </div>
        ) : (
          <div>
            {items.map((gear) => (
              <GearRow
                key={gear.id}
                gear={gear}
                onEdit={() => setModalState({ mode: "edit", gear })}
                onDelete={() => removeGear(gear.id)}
                onSetDefault={() => handleSetDefault(gear.id)}
              />
            ))}
          </div>
        )}
      </SettingsCard>

      {modalState?.mode === "add" && (
        <GearFormModal
          title={t("gear.modalAddTitle")}
          initial={EMPTY_FORM}
          onSave={(input) => addGear(input).then(() => undefined)}
          onClose={() => setModalState(null)}
        />
      )}
      {modalState?.mode === "edit" && (
        <GearFormModal
          title={t("gear.modalEditTitle")}
          initial={{
            name: modalState.gear.name,
            type: modalState.gear.type,
            brand: modalState.gear.brand,
            model: modalState.gear.model,
            weightKg: modalState.gear.weightKg,
            isDefault: modalState.gear.isDefault,
            cda: modalState.gear.cda,
            crr: modalState.gear.crr,
            drivetrainEfficiency: modalState.gear.drivetrainEfficiency,
          }}
          onSave={(input) => updateGear(modalState.gear.id, input)}
          onClose={() => setModalState(null)}
        />
      )}
    </>
  );
}
