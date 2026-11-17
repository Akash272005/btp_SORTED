"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Highlighter,
  Strikethrough,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface NotesEditorProps {
  contentHtml: string;
  onChange: (html: string) => void;
  editable?: boolean;
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export default function NotesEditor({
  contentHtml,
  onChange,
  editable = true,
}: NotesEditorProps) {
  const { t } = useTranslation();
  const skipNextUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({
        placeholder: t("notes.editor_placeholder"),
      }),
    ],
    content: contentHtml || "<p></p>",
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      if (skipNextUpdate.current) return;
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = contentHtml || "<p></p>";
    if (current !== incoming) {
      skipNextUpdate.current = true;
      editor.commands.setContent(incoming, { emitUpdate: false });
      skipNextUpdate.current = false;
    }
  }, [contentHtml, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  const wrap = useCallback(
    (fn: () => void) => () => {
      fn();
      editor?.chain().focus().run();
    },
    [editor],
  );

  if (!editor) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        {t("Loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-2 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <ToolbarButton
            onClick={wrap(() => editor.chain().focus().toggleBold().run())}
            active={editor.isActive("bold")}
            title={t("Bold")}
          >
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={wrap(() => editor.chain().focus().toggleItalic().run())}
            active={editor.isActive("italic")}
            title={t("Italic")}
          >
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={wrap(() => editor.chain().focus().toggleStrike().run())}
            active={editor.isActive("strike")}
            title={t("Strikethrough")}
          >
            <Strikethrough className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={wrap(() => editor.chain().focus().toggleHighlight().run())}
            active={editor.isActive("highlight")}
            title={t("notes.highlight")}
          >
            <Highlighter className="w-4 h-4" />
          </ToolbarButton>
          <span className="w-px h-5 bg-slate-200 dark:bg-slate-600 mx-1" />
          <ToolbarButton
            onClick={wrap(() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run(),
            )}
            active={editor.isActive("heading", { level: 2 })}
            title={t("notes.heading")}
          >
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={wrap(() => editor.chain().focus().toggleBulletList().run())}
            active={editor.isActive("bulletList")}
            title={t("notes.bullet_list")}
          >
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={wrap(() => editor.chain().focus().toggleOrderedList().run())}
            active={editor.isActive("orderedList")}
            title={t("notes.numbered_list")}
          >
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
        </div>
      )}
      <EditorContent
        editor={editor}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 prose prose-slate dark:prose-invert max-w-none prose-sm focus:outline-none [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-slate-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-700/50"
      />
    </div>
  );
}
