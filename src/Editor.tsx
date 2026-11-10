import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/typescript/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/css/register";
import "monaco-editor/languages/definitions/markdown/register";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
(self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };
const language = (path: string) =>
  path.endsWith(".ts") || path.endsWith(".js")
    ? "typescript"
    : path.endsWith(".css")
      ? "css"
      : path.endsWith(".md")
        ? "markdown"
        : "plaintext";
export function Code({
  value,
  onChange,
  path = "",
  readOnly = false,
  height = "360px",
}: {
  value: string;
  onChange?: (s: string) => void;
  path?: string;
  readOnly?: boolean;
  height?: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null),
    callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const model = monaco.editor.createModel(value, language(path));
    const e = monaco.editor.create(host.current, {
      model,
      theme: "vs-dark",
      readOnly,
      minimap: { enabled: false },
      fontSize: 12,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: "on",
      padding: { top: 14 },
    });
    editor.current = e;
    const subscription = e.onDidChangeModelContent(() =>
      callback.current?.(e.getValue()),
    );
    return () => {
      subscription.dispose();
      e.dispose();
      model.dispose();
      editor.current = null;
    };
  }, [path, readOnly]);
  useEffect(() => {
    if (editor.current && editor.current.getValue() !== value)
      editor.current.setValue(value);
  }, [value]);
  return (
    <div
      ref={host}
      style={{ height, width: "100%", minWidth: 0 }}
      aria-label={readOnly ? "Read-only code" : "Code editor"}
    />
  );
}
export function Diff({
  before,
  after,
  path,
}: {
  before: string;
  after: string;
  path: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const original = monaco.editor.createModel(before, language(path)),
      modified = monaco.editor.createModel(after, language(path));
    const e = monaco.editor.createDiffEditor(host.current, {
      theme: "vs-dark",
      readOnly: true,
      originalEditable: false,
      minimap: { enabled: false },
      fontSize: 12,
      automaticLayout: true,
      renderSideBySide: true,
      scrollBeyondLastLine: false,
    });
    e.setModel({ original, modified });
    return () => {
      e.setModel(null);
      e.dispose();
      original.dispose();
      modified.dispose();
    };
  }, [before, after, path]);
  return (
    <div
      ref={host}
      style={{ height: 370, width: "100%", minWidth: 0 }}
      aria-label={"Diff for " + path}
    />
  );
}
