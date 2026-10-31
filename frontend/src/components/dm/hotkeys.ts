/**
 * Single-letter shortcuts (N for notes, E to end a turn) must never fire while
 * the DM is typing (Plan 128 — Marco's "n" in a read-aloud opened the notes).
 *
 * True when the key press belongs to a text field: an input, textarea, select,
 * anything contenteditable or with role="textbox", or a key that is still being
 * composed by an input method. Checks both the event target and the focused
 * element, since a key can be dispatched to <body> while a field inside a
 * portal holds focus.
 */
export function isTypingTarget(e: KeyboardEvent): boolean {
  if (e.isComposing) return true;
  return isTextField(e.target) || isTextField(document.activeElement);
}

function isTextField(node: EventTarget | Element | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const tag = node.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (node.isContentEditable) return true;
  return !!node.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"]');
}
