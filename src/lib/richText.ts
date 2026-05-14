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
  return /<\s*\/?\s*(p|br|strong|b|em|i|u|ul|ol|li|a|h3|blockquote)\b/i.test(value);
}

function renderInlineMarkdown(value: string) {
  const tokens: string[] = [];
  const stash = (html: string) => {
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };

  let escaped = escapeHtml(value);
  escaped = escaped.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_match, label: string, href: string) =>
      stash(`<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`),
  );
  escaped = escaped.replace(/\*\*([^\n]+?)\*\*/g, (_match, text: string) => stash(`<strong>${text}</strong>`));
  escaped = escaped.replace(/__([^\n]+?)__/g, (_match, text: string) => stash(`<strong>${text}</strong>`));
  escaped = escaped.replace(/(^|[^\*])\*([^*\n]+)\*/g, (_match, prefix: string, text: string) => `${prefix}${stash(`<em>${text}</em>`)}`);
  escaped = escaped.replace(/(^|[^_])_([^_\n]+)_/g, (_match, prefix: string, text: string) => `${prefix}${stash(`<em>${text}</em>`)}`);
  return escaped.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => tokens[Number(index)] ?? "");
}

function normalizeMarkdown(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const blocks: string[] = [];
  const lines = trimmed.split(/\r?\n/);
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
    paragraph = [];
  };
  const flushBullets = () => {
    if (!bullets.length) {
      return;
    }
    blocks.push(`<ul>${bullets.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
    bullets = [];
  };

  lines.forEach((line) => {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      flushBullets();
      return;
    }
    flushBullets();
    paragraph.push(line);
  });

  flushParagraph();
  flushBullets();
  return blocks.join("");
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
    return hasRichTextMarkup(value) ? value.trim() : normalizeMarkdown(value);
  }

  const source = document.createElement("template");
  source.innerHTML = hasRichTextMarkup(value) ? value : normalizeMarkdown(value);
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
