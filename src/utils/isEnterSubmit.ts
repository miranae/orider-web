export function isEnterSubmit(event: KeyboardEvent): boolean {
  // Some WebKit versions end composition before dispatching the confirming keydown.
  return event.key === "Enter" && !event.isComposing && event.keyCode !== 229;
}
