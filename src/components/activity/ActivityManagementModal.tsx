import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink, Globe, Lock, Pencil, Trash2, Users } from "lucide-react";
import type { Visibility } from "@shared/types";
import Modal from "../Modal";
import { LocalizedLink } from "../LocalizedLink";
import { Button, Text, buttonClass } from "../../theme/components";

interface Props {
  open: boolean;
  canManage: boolean;
  shareAction?: ReactNode;
  stravaActivityUrl?: string | null;
  activityId: string;
  visibility: Visibility;
  onClose: () => void;
  onExport: () => void;
  onDelete: () => void;
  onVisibilityChange: (visibility: Visibility) => Promise<void>;
}

/** 활동 도구를 모으고 소유자에게만 수정·공개범위·삭제를 제공한다. */
export default function ActivityManagementModal({ open, canManage, shareAction, stravaActivityUrl, activityId, visibility, onClose, onExport, onDelete, onVisibilityChange }: Props) {
  const { t } = useTranslation("activity");
  const name = useId();
  const [saving, setSaving] = useState(false);
  const options = [
    { value: "everyone", icon: Globe }, { value: "friends", icon: Users }, { value: "private", icon: Lock },
  ] as const;
  return <Modal open={open} onClose={onClose} title={t("page.management.title")} maxWidth="max-w-sm" busy={saving} portalClassName="activity-management-dialog">
    <div className="activity-management-content">
      <fieldset className="activity-management-actions" disabled={saving}>
        {shareAction}
        {stravaActivityUrl && <a href={stravaActivityUrl} referrerPolicy="no-referrer" className={buttonClass({ variant: "ghost", className: "activity-management-row" })} aria-disabled={saving || undefined} tabIndex={saving ? -1 : undefined} onClick={event => { if (saving) event.preventDefault(); else onClose(); }}>
          <ExternalLink size={18} aria-hidden="true" /><span>{t("stravaSummary.view")}</span>
        </a>}
        {canManage && <LocalizedLink to={`/activity/${activityId}/edit`} className={buttonClass({ variant: "ghost", className: "activity-management-row" })} aria-disabled={saving || undefined} tabIndex={saving ? -1 : undefined} onClick={event => { if (saving) event.preventDefault(); else onClose(); }}>
          <Pencil size={18} aria-hidden="true" /><span>{t("page.management.edit")}</span>
        </LocalizedLink>}
        <Button variant="ghost" className="activity-management-row" disabled={saving} onClick={onExport} leadingIcon={<Download size={18} aria-hidden="true" />}>{t("tab.export")}</Button>
      </fieldset>
      {canManage && <fieldset className="activity-management-visibility" disabled={saving}>
        <Text as="legend" variant="bodyMedium" weight={600}>{t("page.management.visibility")}</Text>
        <Text as="p" variant="caption" tone="tertiary">{t("page.management.visibilityHint")}</Text>
        {options.map(option => <label key={option.value}>
          <option.icon size={18} aria-hidden="true" />
          <Text variant="bodyMedium">{t(`page.visibility.${option.value}`)}</Text>
          <input type="radio" name={name} value={option.value} checked={visibility === option.value} onChange={() => {
            if (visibility === option.value) return;
            setSaving(true);
            void onVisibilityChange(option.value).finally(() => setSaving(false));
          }} />
        </label>)}
      </fieldset>}
      {canManage && <div className="activity-management-danger">
        <Button variant="ghost" className="activity-management-row activity-management-row--danger" disabled={saving} onClick={onDelete} leadingIcon={<Trash2 size={18} aria-hidden="true" />}>{t("page.delete")}</Button>
      </div>}
    </div>
  </Modal>;
}
