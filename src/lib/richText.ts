const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "UL",
  "OL",
  "LI",
  "A",
  "H3",
  "BLOCKQUOTE",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasRichTextMarkup(value: string) {
  return /<\s*\/?\s*(p|br|strong|b|em|i|u|ul|ol|li|a)\b/i.test(value);
}

function normalizeParagraphs(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function sanitizeHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed, "https://example.invalid");
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return trimmed;
    }
  } catch {
    return "";
  }

  return "";
}

function sanitizeNode(node: Node, targetDocument: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return targetDocument.createTextNode(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toUpperCase();

  if (!ALLOWED_TAGS.has(tagName)) {
    const fragment = targetDocument.createDocumentFragment();
    Array.from(element.childNodes).forEach((childNode) => {
      const sanitizedChild = sanitizeNode(childNode, targetDocument);
      if (sanitizedChild) {
        fragment.appendChild(sanitizedChild);
      }
    });
    return fragment;
  }

  const sanitizedElement = targetDocument.createElement(tagName.toLowerCase());
  if (tagName === "A") {
    const href = sanitizeHref(element.getAttribute("href") ?? "");
    if (href) {
      sanitizedElement.setAttribute("href", href);
      sanitizedElement.setAttribute("target", "_blank");
      sanitizedElement.setAttribute("rel", "noreferrer");
    }
  }

  Array.from(element.childNodes).forEach((childNode) => {
    const sanitizedChild = sanitizeNode(childNode, targetDocument);
    if (sanitizedChild) {
      sanitizedElement.appendChild(sanitizedChild);
    }
  });

  return sanitizedElement;
}

export function normalizeRichText(value: string) {
  if (!value.trim()) {
    return "";
  }

  if (typeof document === "undefined") {
    return hasRichTextMarkup(value) ? value.trim() : normalizeParagraphs(value);
  }

  const source = document.createElement("template");
  source.innerHTML = hasRichTextMarkup(value) ? value : normalizeParagraphs(value);
  const target = document.createElement("div");

  Array.from(source.content.childNodes).forEach((node) => {
    const sanitizedNode = sanitizeNode(node, document);
    if (sanitizedNode) {
      target.appendChild(sanitizedNode);
    }
  });

  if (!(target.textContent ?? "").trim()) {
    return "";
  }

  return target.innerHTML.trim();
}

export function richTextToPlainText(value: string) {
  if (!value.trim()) {
    return "";
  }

  if (typeof document === "undefined" || !hasRichTextMarkup(value)) {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const container = document.createElement("div");
  container.innerHTML = normalizeRichText(value);
  return container.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
