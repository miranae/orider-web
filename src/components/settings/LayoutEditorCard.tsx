import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, X } from "lucide-react";

import type {
  DataFieldType,
  DataPageConfig,
  LayoutConfig,
} from "@shared/types/deviceSettings";

import { SettingsCard } from "./_primitives";
import { DATA_FIELD_GROUPS, DATA_FIELD_LABEL_KEYS } from "./dataFieldLabels";
import { Button } from "../../theme/components";

const COLS = 4;
const DEFAULT_ROWS = 8;
const MAX_ROWS = 12;
const MAX_PAGES = 5;

function clonePages(pages: LayoutConfig[]): LayoutConfig[] {
  return pages.map((p) => ({
    columns: p.columns,
    rows: p.rows,
    fields: p.fields.map((f) => ({ ...f })),
  }));
}

function isOccupied(page: LayoutConfig, col: number, row: number, ignore?: number): boolean {
  return page.fields.some(
    (f, i) =>
      i !== ignore &&
      col >= f.col &&
      col < f.col + f.colSpan &&
      row >= f.row &&
      row < f.row + f.rowSpan,
  );
}

function neededRows(page: LayoutConfig): number {
  const max = page.fields.reduce((m, f) => Math.max(m, f.row + f.rowSpan), DEFAULT_ROWS);
  return Math.min(MAX_ROWS, max);
}

interface Props {
  config: DataPageConfig;
  onSave: (next: DataPageConfig) => Promise<void>;
}

export function LayoutEditorCard({ config, onSave }: Props) {
  const { t } = useTranslation("settings");
  const [draft, setDraft] = useState<LayoutConfig[]>(clonePages(config.pages));
  const [activePage, setActivePage] = useState(0);
  const [picker, setPicker] = useState<
    | { mode: "new"; col: number; row: number }
    | { mode: "edit"; placementIndex: number }
    | null
  >(null);
  const [saving, setSaving] = useState(false);

  // config 변경 시 draft 동기화 (취소나 외부 새로고침)
  useEffect(() => {
    setDraft(clonePages(config.pages));
    setActivePage((p) => Math.min(p, config.pages.length - 1));
    setPicker(null);
  }, [config]);

  const dirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(config.pages);
  }, [draft, config]);

  const page = draft[activePage] ?? draft[0];
  if (!page) return null;
  const rows = neededRows(page);

  function patchPage(updater: (p: LayoutConfig) => LayoutConfig) {
    setDraft((prev) =>
      prev.map((p, i) => (i === activePage ? updater(p) : p)),
    );
  }

  function setFieldAt(placementIndex: number, type: DataFieldType) {
    patchPage((p) => ({
      ...p,
      fields: p.fields.map((f, i) => (i === placementIndex ? { ...f, type } : f)),
    }));
  }

  function removeField(placementIndex: number) {
    patchPage((p) => ({
      ...p,
      fields: p.fields.filter((_, i) => i !== placementIndex),
    }));
  }

  function addField(col: number, row: number, type: DataFieldType) {
    patchPage((p) => ({
      ...p,
      fields: [...p.fields, { type, col, row, colSpan: 1, rowSpan: 1 }],
    }));
  }

  function changeSpan(placementIndex: number, dCol: number, dRow: number) {
    patchPage((p) => {
      const f = p.fields[placementIndex];
      if (!f) return p;
      const newColSpan = Math.max(1, Math.min(COLS - f.col, f.colSpan + dCol));
      const newRowSpan = Math.max(1, Math.min(MAX_ROWS - f.row, f.rowSpan + dRow));
      // 충돌 검사: 확장 영역에 다른 placement가 있으면 막음
      for (let r = f.row; r < f.row + newRowSpan; r++) {
        for (let c = f.col; c < f.col + newColSpan; c++) {
          if (isOccupied(p, c, r, placementIndex)) return p;
        }
      }
      return {
        ...p,
        fields: p.fields.map((x, i) =>
          i === placementIndex ? { ...x, colSpan: newColSpan, rowSpan: newRowSpan } : x,
        ),
      };
    });
  }

  function addPage() {
    if (draft.length >= MAX_PAGES) return;
    setDraft((prev) => [
      ...prev,
      {
        columns: COLS,
        rows: DEFAULT_ROWS,
        fields: [{ type: "SPEED", col: 0, row: 0, colSpan: 4, rowSpan: 2 }],
      },
    ]);
    setActivePage(draft.length); // 새 페이지로 이동
  }

  function removePage() {
    if (draft.length <= 1) return;
    if (!window.confirm(t("layout.deletePageConfirm"))) return;
    setDraft((prev) => prev.filter((_, i) => i !== activePage));
    setActivePage((p) => Math.max(0, p - 1));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ pages: draft });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraft(clonePages(config.pages));
    setActivePage(0);
    setPicker(null);
  }

  // 빈 셀 좌표들 (점유되지 않은 모든 col, row)
  const emptyCells: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isOccupied(page, c, r)) emptyCells.push({ col: c, row: r });
    }
  }

  const cellHeight = 44;

  return (
    <SettingsCard
      title={t("layout.cardTitle")}
      action={
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="ghost" size="sm"
            onClick={handleReset}
            disabled={!dirty || saving}
          >
            {t("layout.reset")}
          </Button>
          <Button variant="primary" size="sm"
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
          >
            {saving ? t("layout.saving") : t("layout.save")}
          </Button>
        </div>
      }
    >
      {/* 페이지 탭 */}
      <div
        style={{
          display: "flex",
          gap: 'var(--space-1)',
          marginBottom: 'var(--space-3)',
          paddingBottom: 'var(--space-2)',
          borderBottom: "1px solid var(--line-soft)",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {draft.map((_, i) => (
          <button
            key={i}
            onClick={() => setActivePage(i)}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              borderRadius: 6,
              border: "1px solid var(--line-soft)",
              background: i === activePage ? "var(--bg-3)" : "var(--bg-2)",
              color: i === activePage ? "var(--ink-0)" : "var(--ink-3)",
              cursor: "pointer",
              fontWeight: i === activePage ? 600 : 400,
            }}
          >
            {t("layout.pageLabel", { number: i + 1 })}
          </button>
        ))}
        {draft.length < MAX_PAGES && (
          <Button variant="ghost" size="sm"
            onClick={addPage}
            aria-label={t("layout.addPageAriaLabel")}
          >
            <Plus size={12} /> {t("layout.addPage")}
          </Button>
        )}
        {draft.length > 1 && (
          <Button variant="ghost" size="sm"
            onClick={removePage}
            aria-label={t("layout.deletePageAriaLabel")}
            style={{ color: "var(--rose)", marginLeft: "auto" }}
          >
            <Trash2 size={12} /> {t("layout.deletePage")}
          </Button>
        )}
      </div>

      {/* 4열 그리드 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, ${cellHeight}px)`,
          gap: 'var(--space-1)',
          background: "var(--bg-2)",
          padding: 'var(--space-2)',
          borderRadius: 8,
          marginBottom: picker ? 8 : 0,
        }}
      >
        {/* 빈 셀 */}
        {emptyCells.map((cell) => (
          <button
            key={`empty-${cell.col}-${cell.row}`}
            onClick={() => setPicker({ mode: "new", col: cell.col, row: cell.row })}
            style={{
              gridColumn: `${cell.col + 1} / span 1`,
              gridRow: `${cell.row + 1} / span 1`,
              border: "1px dashed var(--line-soft)",
              background: "transparent",
              color: "var(--ink-4)",
              fontSize: 11,
              borderRadius: 4,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label={t("layout.addFieldAriaLabel")}
          >
            +
          </button>
        ))}

        {/* 점유된 placement */}
        {page.fields.map((f, i) => {
          const isSelected =
            picker && picker.mode === "edit" && picker.placementIndex === i;
          return (
            <div
              key={i}
              style={{
                gridColumn: `${f.col + 1} / span ${f.colSpan}`,
                gridRow: `${f.row + 1} / span ${f.rowSpan}`,
                background: isSelected
                  ? "color-mix(in oklch, var(--lime) 14%, var(--bg-1))"
                  : "var(--bg-1)",
                border: `1px solid ${isSelected ? "var(--lime)" : "var(--line-soft)"}`,
                borderRadius: 4,
                padding: "4px 6px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                alignItems: "stretch",
                position: "relative",
                fontSize: 12,
                color: "var(--ink-1)",
                overflow: "hidden",
              }}
              onClick={() => setPicker({ mode: "edit", placementIndex: i })}
            >
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontWeight: 500,
                }}
              >
                {t(DATA_FIELD_LABEL_KEYS[f.type])}
              </span>
              {(f.colSpan > 1 || f.rowSpan > 1) && (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--ink-3)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {f.colSpan}×{f.rowSpan}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 편집 패널 */}
      {picker && (
        <PickerPanel
          page={page}
          picker={picker}
          onClose={() => setPicker(null)}
          onSelect={(type) => {
            if (picker.mode === "new") {
              addField(picker.col, picker.row, type);
              setPicker(null);
            } else {
              setFieldAt(picker.placementIndex, type);
            }
          }}
          onRemove={() => {
            if (picker.mode === "edit") {
              removeField(picker.placementIndex);
              setPicker(null);
            }
          }}
          onSpan={(dCol, dRow) => {
            if (picker.mode === "edit") changeSpan(picker.placementIndex, dCol, dRow);
          }}
        />
      )}
    </SettingsCard>
  );
}

interface PickerPanelProps {
  page: LayoutConfig;
  picker:
    | { mode: "new"; col: number; row: number }
    | { mode: "edit"; placementIndex: number };
  onClose: () => void;
  onSelect: (type: DataFieldType) => void;
  onRemove: () => void;
  onSpan: (dCol: number, dRow: number) => void;
}

function PickerPanel({
  page,
  picker,
  onClose,
  onSelect,
  onRemove,
  onSpan,
}: PickerPanelProps) {
  const { t } = useTranslation("settings");
  const [search, setSearch] = useState("");
  const editing = picker.mode === "edit" ? page.fields[picker.placementIndex] : null;

  const lower = search.trim().toLowerCase();
  const filteredGroups = DATA_FIELD_GROUPS.map((g) => ({
    titleKey: g.titleKey,
    fields: g.fields.filter((f) => {
      if (!lower) return true;
      const label = t(DATA_FIELD_LABEL_KEYS[f]).toLowerCase();
      return label.includes(lower) || f.toLowerCase().includes(lower);
    }),
  })).filter((g) => g.fields.length > 0);

  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line-soft)",
        borderRadius: 8,
        padding: 'var(--space-3)',
        marginTop: 'var(--space-3)',
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 'var(--space-3)',
        }}
      >
        <div style={{ fontSize: 13, color: "var(--ink-1)", fontWeight: 600 }}>
          {picker.mode === "new"
            ? t("layout.pickerAddTitle", { col: picker.col + 1, row: picker.row + 1 })
            : t("layout.pickerEditTitle", { label: editing ? t(DATA_FIELD_LABEL_KEYS[editing.type]) : "" })}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>

      {editing && (
        <div
          style={{
            display: "flex",
            gap: 'var(--space-3)',
            alignItems: "center",
            paddingBottom: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
            borderBottom: "1px solid var(--line-soft)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{t("layout.spanWidth")}</span>
            <Button variant="ghost" size="sm"
              onClick={() => onSpan(-1, 0)}
              disabled={editing.colSpan <= 1}
            >
              −
            </Button>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                width: 16,
                textAlign: "center",
              }}
            >
              {editing.colSpan}
            </span>
            <Button variant="ghost" size="sm"
              onClick={() => onSpan(1, 0)}
            >
              +
            </Button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{t("layout.spanHeight")}</span>
            <Button variant="ghost" size="sm"
              onClick={() => onSpan(0, -1)}
              disabled={editing.rowSpan <= 1}
            >
              −
            </Button>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                width: 16,
                textAlign: "center",
              }}
            >
              {editing.rowSpan}
            </span>
            <Button variant="ghost" size="sm"
              onClick={() => onSpan(0, 1)}
            >
              +
            </Button>
          </div>
          <Button variant="ghost" size="sm"
            onClick={onRemove}
            aria-label={t("layout.removeCellAriaLabel")}
            style={{ color: "var(--rose)", marginLeft: "auto" }}
          >
            <Trash2 size={12} /> {t("layout.removeCell")}
          </Button>
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("layout.fieldSearch")}
        style={{
          width: "100%",
          padding: "6px 10px",
          marginBottom: 'var(--space-3)',
          fontSize: 13,
          border: "1px solid var(--line)",
          borderRadius: 6,
          background: "var(--bg-2)",
          color: "var(--ink-0)",
        }}
      />

      <div
        style={{
          maxHeight: 320,
          overflowY: "auto",
          display: "grid",
          gap: 'var(--space-3)',
        }}
      >
        {filteredGroups.map((g) => (
          <div key={g.titleKey}>
            <div
              style={{
                fontSize: 10,
                color: "var(--ink-3)",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 'var(--space-1)',
              }}
            >
              {t(g.titleKey)}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 'var(--space-1)',
              }}
            >
              {g.fields.map((f) => {
                const isCurrent = editing?.type === f;
                return (
                  <button
                    key={f}
                    onClick={() => onSelect(f)}
                    style={{
                      padding: "5px 8px",
                      fontSize: 11,
                      borderRadius: 4,
                      border: `1px solid ${
                        isCurrent ? "var(--lime)" : "var(--line-soft)"
                      }`,
                      background: isCurrent
                        ? "color-mix(in oklch, var(--lime) 12%, var(--bg-1))"
                        : "var(--bg-2)",
                      color: "var(--ink-1)",
                      textAlign: "left",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t(DATA_FIELD_LABEL_KEYS[f])}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {t("layout.noResults")}
          </div>
        )}
      </div>
    </div>
  );
}
