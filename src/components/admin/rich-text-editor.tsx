"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "@/lib/utils";
import { Bold, Italic, List, ListOrdered, Heading2, Quote } from "lucide-react";

export function RichTextEditor({
  name,
  defaultValue,
  placeholder,
  onChange,
}: {
  name?: string;
  defaultValue?: string | null;
  placeholder?: string;
  onChange?: (html: string) => void;
}) {
  const [html, setHtml] = useState(defaultValue || "");

  const editor = useEditor({
    extensions: [StarterKit],
    content: defaultValue || "",
    editorProps: {
      attributes: { "data-placeholder": placeholder ?? "" },
    },
    onUpdate: ({ editor }) => {
      const next = editor.getHTML();
      setHtml(next);
      onChange?.(next);
    },
    immediatelyRender: false,
  });

  if (!editor) return <div className="h-[196px] animate-pulse rounded-lg bg-ink-100" />;

  const buttons = [
    { icon: Bold, label: "Bold", active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { icon: Italic, label: "Italic", active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { icon: Heading2, label: "Heading", active: editor.isActive("heading", { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: List, label: "Bullet list", active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { icon: ListOrdered, label: "Numbered list", active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { icon: Quote, label: "Callout quote", active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-ink-300 bg-ink-100 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/20">
      <div className="flex items-center gap-0.5 border-b border-ink-300 bg-ink-200 p-1.5">
        {buttons.map((btn) => (
          <button
            key={btn.label}
            type="button"
            title={btn.label}
            onClick={btn.run}
            className={cn(
              "rounded p-1.5 text-ink-500 hover:bg-ink-300",
              btn.active && "bg-brand-400 text-ink-50 hover:bg-brand-400"
            )}
          >
            <btn.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
      {name && <input type="hidden" name={name} value={html} readOnly />}
    </div>
  );
}
