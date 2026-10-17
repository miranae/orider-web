import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTrainingDialog } from "../components/training/useTrainingDialog";
import { useTranslation } from "react-i18next";
import { Alert, Button, Input, Textarea, type AlertVariant } from "../theme/components";

type DialogKind = "alert" | "confirm" | "prompt";

export interface DialogOptions {
  title?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  variant?: AlertVariant;
  destructive?: boolean;
}

export interface PromptDialogOptions extends DialogOptions {
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
}

interface DialogRequest {
  kind: DialogKind;
  message: ReactNode;
  options: PromptDialogOptions;
  resolve: (value: boolean | string | null) => void;
}

interface DialogContextValue {
  alert: (message: ReactNode, options?: DialogOptions) => Promise<void>;
  confirm: (message: ReactNode, options?: DialogOptions) => Promise<boolean>;
  prompt: (message: ReactNode, options?: PromptDialogOptions) => Promise<string | null>;
}

const fallbackDialog: DialogContextValue = {
  alert: async () => undefined,
  confirm: async () => false,
  prompt: async () => null,
};

const DialogContext = createContext<DialogContextValue>(fallbackDialog);

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const labels = {
    alertTitle: t("dialog.alertTitle"),
    confirmTitle: t("dialog.confirmTitle"),
    promptTitle: t("dialog.promptTitle"),
    ok: t("dialog.ok"),
    cancel: t("button.cancel"),
  };
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const open = useCallback(
    (kind: DialogKind, message: ReactNode, options: PromptDialogOptions = {}) =>
      new Promise<boolean | string | null>((resolve) => {
        setPromptValue(options.defaultValue ?? "");
        setRequest({ kind, message, options, resolve });
      }),
    [],
  );

  const alert = useCallback<DialogContextValue["alert"]>(
    async (message, options) => {
      await open("alert", message, options);
    },
    [open],
  );

  const confirm = useCallback<DialogContextValue["confirm"]>(
    async (message, options) => Boolean(await open("confirm", message, options)),
    [open],
  );

  const prompt = useCallback<DialogContextValue["prompt"]>(
    async (message, options) => {
      const value = await open("prompt", message, options);
      return typeof value === "string" ? value : null;
    },
    [open],
  );

  const close = useCallback(
    (value: boolean | string | null) => {
      const current = request;
      if (!current) return;
      current.resolve(value);
      setRequest(null);
    },
    [request],
  );

  const value = useMemo(() => ({ alert, confirm, prompt }), [alert, confirm, prompt]);

  const title =
    request?.options.title ??
    (request?.kind === "prompt" ? labels.promptTitle : request?.kind === "confirm" ? labels.confirmTitle : labels.alertTitle);
  const variant = request?.options.destructive ? "danger" : request?.options.variant ?? "info";
  const confirmLabel = request?.options.confirmLabel ?? labels.ok;
  const cancelLabel = request?.options.cancelLabel ?? labels.cancel;

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    close(promptValue);
  };

  return (
    <DialogContext.Provider value={value}>
      {children}
      {request &&
        createPortal(
          <div className="app-dialog" role="presentation">
            <button className="app-dialog__backdrop" type="button" aria-label={String(cancelLabel)} onClick={() => close(request.kind === "alert" ? true : null)} />
            <DialogPanel
              onClose={() => close(request.kind === "alert" ? true : null)}
              className="app-dialog__panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-dialog-title"
              onSubmit={request.kind === "prompt" ? submitPrompt : undefined}
            >
              <Alert variant={variant} title={<span id="app-dialog-title">{title}</span>}>
                {request.message}
              </Alert>
              {request.kind === "prompt" &&
                (request.options.multiline ? (
                  <Textarea
                    data-dialog-initial-focus
                    value={promptValue}
                    placeholder={request.options.placeholder}
                    onChange={(event) => setPromptValue(event.target.value)}
                  />
                ) : (
                  <Input
                    data-dialog-initial-focus
                    value={promptValue}
                    placeholder={request.options.placeholder}
                    onChange={(event) => setPromptValue(event.target.value)}
                  />
                ))}
              <div className="app-dialog__actions">
                {request.kind !== "alert" && (
                  <Button data-dialog-initial-focus={request.kind === "confirm" ? true : undefined} type="button" variant="secondary" onClick={() => close(null)}>
                    {cancelLabel}
                  </Button>
                )}
                <Button
                  type={request.kind === "prompt" ? "submit" : "button"}
                  variant={request.options.destructive ? "danger" : "primary"}
                  onClick={request.kind === "prompt" ? undefined : () => close(true)}
                >
                  {confirmLabel}
                </Button>
              </div>
            </DialogPanel>
          </div>,
          document.body,
        )}
    </DialogContext.Provider>
  );
}

function DialogPanel({ onClose, ...props }: ComponentProps<"form"> & { onClose: () => void }) {
  const ref = useTrainingDialog<HTMLFormElement>(onClose, false);
  return <form {...props} ref={ref} tabIndex={-1} />;
}

export function useDialog() {
  return useContext(DialogContext);
}
