import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useEffect } from "react";
import { normalizeRichText } from "../lib/richText";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

type ToolbarAction = {
  label: string;
  title: string;
  isActive: (editor: Editor | null) => boolean;
  run: (editor: Editor) => void;
};

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  {
    label: "B",
    title: "Bold",
    isActive: (editor) => Boolean(editor?.isActive("bold")),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    label: "I",
    title: "Italic",
    isActive: (editor) => Boolean(editor?.isActive("italic")),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    label: "U",
    title: "Underline",
    isActive: (editor) => Boolean(editor?.isActive("underline")),
    run: (editor) => editor.chain().focus().toggleUnderline().run(),
  },
  {
    label: "H",
    title: "Heading",
    isActive: (editor) => Boolean(editor?.isActive("heading", { level: 3 })),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: "• List",
    title: "Bullet List",
    isActive: (editor) => Boolean(editor?.isActive("bulletList")),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: "1. List",
    title: "Numbered List",
    isActive: (editor) => Boolean(editor?.isActive("orderedList")),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Quote",
    title: "Quote",
    isActive: (editor) => Boolean(editor?.isActive("blockquote")),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
];

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: normalizeRichText(value),
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) => {
      onChange(normalizeRichText(nextEditor.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    const normalizedValue = normalizeRichText(value);
    if (editor.getHTML() !== normalizedValue) {
      editor.commands.setContent(normalizedValue || "<p></p>", { emitUpdate: false });
    }
  }, [editor, value]);

  function handleSetLink() {
    if (!editor) {
      return;
    }

    const currentHref = editor.getAttributes("link").href as string | undefined;
    const nextHref = window.prompt("Enter a URL", currentHref ?? "https://");
    if (nextHref === null) {
      return;
    }

    if (!nextHref.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: nextHref.trim() }).run();
  }

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Intro formatting">
        {TOOLBAR_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`ghost-button rich-text-tool ${action.isActive(editor) ? "is-active" : ""}`}
            title={action.title}
            onClick={() => {
              if (!editor) {
                return;
              }
              action.run(editor);
            }}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className={`ghost-button rich-text-tool ${editor?.isActive("link") ? "is-active" : ""}`}
          title="Link"
          onClick={handleSetLink}
        >
          Link
        </button>
      </div>
      <div className="rich-text-surface" data-placeholder={placeholder}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

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
