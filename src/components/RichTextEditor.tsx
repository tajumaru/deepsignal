import { useEffect, useRef, useState } from "react";
import { normalizeRichText } from "../lib/richText";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

type ToolbarAction = {
  label: string;
  title: string;
  command: string;
  value?: string;
};

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: "B", title: "Bold", command: "bold" },
  { label: "I", title: "Italic", command: "italic" },
  { label: "U", title: "Underline", command: "underline" },
  { label: "H", title: "Heading", command: "formatBlock", value: "h3" },
  { label: "List", title: "Bullet List", command: "insertUnorderedList" },
  { label: "1. List", title: "Numbered List", command: "insertOrderedList" },
  { label: "Quote", title: "Quote", command: "formatBlock", value: "blockquote" },
];

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedValueRef = useRef("");
  const [activeCommands, setActiveCommands] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const normalizedValue = normalizeRichText(value);
    if (lastEmittedValueRef.current === normalizedValue) {
      return;
    }
    if (normalizeRichText(editor.innerHTML) !== normalizedValue) {
      editor.innerHTML = normalizedValue || "";
    }
  }, [value]);

  function syncValue() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const normalizedValue = normalizeRichText(editor.innerHTML);
    lastEmittedValueRef.current = normalizedValue;
    onChange(normalizedValue);
    refreshActiveCommands();
  }

  function refreshActiveCommands() {
    const nextActiveCommands = new Set<string>();
    for (const command of ["bold", "italic", "underline", "insertUnorderedList", "insertOrderedList"]) {
      if (document.queryCommandState(command)) {
        nextActiveCommands.add(command);
      }
    }
    setActiveCommands(nextActiveCommands);
  }

  function runCommand(action: ToolbarAction) {
    editorRef.current?.focus();
    document.execCommand(action.command, false, action.value);
    syncValue();
  }

  function handleSetLink() {
    editorRef.current?.focus();
    const nextHref = window.prompt("Enter a URL", "https://");
    if (nextHref === null) {
      return;
    }

    const trimmedHref = nextHref.trim();
    if (!trimmedHref) {
      document.execCommand("unlink");
      syncValue();
      return;
    }

    document.execCommand("createLink", false, trimmedHref);
    syncValue();
  }

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Intro formatting">
        {TOOLBAR_ACTIONS.map((action) => (
          <button
            key={`${action.command}-${action.value ?? ""}`}
            type="button"
            className={`ghost-button rich-text-tool ${activeCommands.has(action.command) ? "is-active" : ""}`}
            title={action.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand(action)}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className="ghost-button rich-text-tool"
          title="Link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleSetLink}
        >
          Link
        </button>
      </div>
      <div className="rich-text-surface" data-placeholder={placeholder}>
        <div
          ref={editorRef}
          className="rich-text-input"
          contentEditable
          role="textbox"
          aria-label={placeholder}
          aria-multiline="true"
          data-placeholder={placeholder}
          onInput={syncValue}
          onKeyUp={refreshActiveCommands}
          onMouseUp={refreshActiveCommands}
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
}
