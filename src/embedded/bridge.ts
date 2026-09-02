export const EMBEDDED_BRIDGE_VERSION = 1 as const;
export const EMBEDDED_BRIDGE_MAX_BYTES = 16 * 1024;

export const HOST_MESSAGE_TYPES = [
  "host.authorize",
  "host.sessionAccepted",
  "host.sessionRejected",
  "host.lifecycle",
  "host.surfaceSelected",
  "host.retry",
  "host.logout",
] as const;

export const WEB_MESSAGE_TYPES = [
  "bootstrap.ready",
  "surface.shellReady",
  "surface.ready",
  "auth.state",
  "surface.error",
  "navigation.openExternal",
  "navigation.openNative",
  "telemetry.event",
] as const;

export type HostMessageType = (typeof HOST_MESSAGE_TYPES)[number];
export type WebMessageType = (typeof WEB_MESSAGE_TYPES)[number];

export interface BridgeEnvelope<TType extends string = string, TPayload = unknown> {
  version: typeof EMBEDDED_BRIDGE_VERSION;
  type: TType;
  requestId?: string;
  payload: TPayload;
}

export type HostBridgeEnvelope = BridgeEnvelope<HostMessageType>;
export type WebBridgeEnvelope = BridgeEnvelope<WebMessageType>;

export type BridgeRejectionReason =
  | "invalid-input"
  | "message-too-large"
  | "malformed-json"
  | "invalid-envelope"
  | "unsupported-version"
  | "unsupported-type";

export type HostMessageParseResult =
  | { ok: true; message: HostBridgeEnvelope }
  | { ok: false; reason: BridgeRejectionReason };

export interface EmbeddedBridgeTransport {
  postMessage(serializedMessage: string): void;
  subscribe(listener: (serializedMessage: string) => void): () => void;
}

export interface EmbeddedBridge {
  send<TPayload>(type: WebMessageType, payload: TPayload, requestId?: string): void;
  subscribe(listener: (message: HostBridgeEnvelope) => void): () => void;
  dispose(): void;
}

const HOST_MESSAGE_TYPE_SET = new Set<string>(HOST_MESSAGE_TYPES);
const WEB_MESSAGE_TYPE_SET = new Set<string>(WEB_MESSAGE_TYPES);
const ENVELOPE_KEYS = new Set(["version", "type", "requestId", "payload"]);
const textEncoder = new TextEncoder();

function encodedSize(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyEnvelopeKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) => ENVELOPE_KEYS.has(key));
}

export function parseHostMessage(serializedMessage: unknown): HostMessageParseResult {
  if (typeof serializedMessage !== "string") {
    return { ok: false, reason: "invalid-input" };
  }
  if (encodedSize(serializedMessage) > EMBEDDED_BRIDGE_MAX_BYTES) {
    return { ok: false, reason: "message-too-large" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedMessage);
  } catch {
    return { ok: false, reason: "malformed-json" };
  }

  if (
    !isRecord(parsed)
    || !hasOnlyEnvelopeKeys(parsed)
    || !("payload" in parsed)
    || typeof parsed.type !== "string"
    || ("requestId" in parsed && typeof parsed.requestId !== "string")
  ) {
    return { ok: false, reason: "invalid-envelope" };
  }
  if (parsed.version !== EMBEDDED_BRIDGE_VERSION) {
    return { ok: false, reason: "unsupported-version" };
  }
  if (!HOST_MESSAGE_TYPE_SET.has(parsed.type)) {
    return { ok: false, reason: "unsupported-type" };
  }

  return { ok: true, message: parsed as unknown as HostBridgeEnvelope };
}

export function serializeWebMessage<TPayload>(
  type: WebMessageType,
  payload: TPayload,
  requestId?: string,
): string {
  if (!WEB_MESSAGE_TYPE_SET.has(type)) {
    throw new Error("embedded-bridge/unsupported-type");
  }
  if (payload === undefined || (requestId !== undefined && typeof requestId !== "string")) {
    throw new Error("embedded-bridge/invalid-envelope");
  }

  let serializedMessage: string;
  try {
    serializedMessage = JSON.stringify({
      version: EMBEDDED_BRIDGE_VERSION,
      type,
      ...(requestId === undefined ? {} : { requestId }),
      payload,
    });
  } catch {
    throw new Error("embedded-bridge/invalid-envelope");
  }
  if (encodedSize(serializedMessage) > EMBEDDED_BRIDGE_MAX_BYTES) {
    throw new Error("embedded-bridge/message-too-large");
  }
  const normalized = JSON.parse(serializedMessage) as Record<string, unknown>;
  if (!("payload" in normalized)) {
    throw new Error("embedded-bridge/invalid-envelope");
  }
  return serializedMessage;
}

export function createEmbeddedBridge(
  transport: EmbeddedBridgeTransport,
  onRejected?: (reason: BridgeRejectionReason) => void,
): EmbeddedBridge {
  const listeners = new Set<(message: HostBridgeEnvelope) => void>();
  let disposed = false;

  const unsubscribeTransport = transport.subscribe((serializedMessage) => {
    if (disposed) return;
    const result = parseHostMessage(serializedMessage);
    if (!result.ok) {
      onRejected?.(result.reason);
      return;
    }
    listeners.forEach((listener) => listener(result.message));
  });

  return {
    send(type, payload, requestId) {
      if (disposed) throw new Error("embedded-bridge/disposed");
      transport.postMessage(serializeWebMessage(type, payload, requestId));
    },
    subscribe(listener) {
      if (disposed) throw new Error("embedded-bridge/disposed");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      unsubscribeTransport();
    },
  };
}

interface NativeBridgeWindow extends Window {
  ReactNativeWebView?: { postMessage(message: string): void };
  webkit?: {
    messageHandlers?: {
      orider?: { postMessage(message: string): void };
    };
  };
}

export function createWebViewTransport(targetWindow: Window = window): EmbeddedBridgeTransport {
  const nativeWindow = targetWindow as NativeBridgeWindow;

  return {
    postMessage(serializedMessage) {
      if (nativeWindow.ReactNativeWebView) {
        nativeWindow.ReactNativeWebView.postMessage(serializedMessage);
        return;
      }
      const iosHandler = nativeWindow.webkit?.messageHandlers?.orider;
      if (iosHandler) {
        iosHandler.postMessage(serializedMessage);
        return;
      }
      throw new Error("embedded-bridge/host-unavailable");
    },
    subscribe(listener) {
      const onWindowMessage = (event: MessageEvent<unknown>) => {
        // Reject child-frame traffic. Native window.postMessage delivery is either
        // sourced from this window or has no source on older WebView engines.
        if (event.source !== null && event.source !== targetWindow) return;
        if (typeof event.data === "string") listener(event.data);
      };
      const onDocumentMessage = (event: Event) => {
        const messageEvent = event as MessageEvent<unknown>;
        if (typeof messageEvent.data === "string") listener(messageEvent.data);
      };
      targetWindow.addEventListener("message", onWindowMessage);
      // React Native Android historically dispatches inbound messages on document.
      targetWindow.document.addEventListener("message", onDocumentMessage);
      return () => {
        targetWindow.removeEventListener("message", onWindowMessage);
        targetWindow.document.removeEventListener("message", onDocumentMessage);
      };
    },
  };
}
