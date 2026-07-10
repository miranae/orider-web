import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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

function defaultLabels() {
  const lang = typeof navigator === "undefined" ? "ko" : navigator.language;
  const english = lang.toLowerCase().startsWith("en");
  return {
    alertTitle: english ? "Notice" : "알림",
    confirmTitle: english ? "Confirm" : "확인",
    promptTitle: english ? "Input" : "입력",
    ok: english ? "OK" : "확인",
    cancel: english ? "Cancel" : "취소",
  };
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const labels = useMemo(defaultLabels, []);
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const open = useCallback(
    (kind: DialogKind, message: ReactNode, options: PromptDialogOptions = {}) =>
      new Promise<boolean | string | null>((resolve) => {
        previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      window.setTimeout(() => previouslyFocused.current?.focus(), 0);
    },
    [request],
  );

  useEffect(() => {
    if (!request) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(request.kind === "alert" ? true : null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, request]);

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
            <form
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
                    autoFocus
                    value={promptValue}
                    placeholder={request.options.placeholder}
                    onChange={(event) => setPromptValue(event.target.value)}
                  />
                ) : (
                  <Input
                    autoFocus
                    value={promptValue}
                    placeholder={request.options.placeholder}
                    onChange={(event) => setPromptValue(event.target.value)}
                  />
                ))}
              <div className="app-dialog__actions">
                {request.kind !== "alert" && (
                  <Button type="button" variant="secondary" onClick={() => close(null)}>
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
            </form>
          </div>,
          document.body,
        )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  return useContext(DialogContext);
}
