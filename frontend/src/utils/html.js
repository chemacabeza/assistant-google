/**
 * Decodes HTML entities ("don&#39;t", "&amp;") into plain text, e.g. for Gmail snippets.
 * DOMParser never executes scripts or loads resources, and only the text content is kept,
 * so the result is safe to render as a normal React text node.
 */
export function decodeHtmlEntities(value) {
  if (!value) return value;
  return new DOMParser().parseFromString(value, 'text/html').documentElement.textContent;
}
