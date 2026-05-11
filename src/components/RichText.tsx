import { normalizeRichText } from "../lib/richText";

interface RichTextContentProps {
  value: string;
  className?: string;
  fallback?: string;
}

export function RichTextContent({ value, className, fallback }: RichTextContentProps) {
  const html = normalizeRichText(value);

  if (!html) {
    return fallback ? <p className={className}>{fallback}</p> : null;
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
