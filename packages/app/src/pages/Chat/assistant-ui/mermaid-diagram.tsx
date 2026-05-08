import { useEffect, useRef, useState, type FC } from "react";
import mermaid from "mermaid";
import { useAuiState } from "@assistant-ui/react";
import { useStore } from "@/store";

export const MermaidDiagram: FC<{ code: string; language: string }> = ({ code }) => {
  const idRef = useRef(crypto.randomUUID().replace(/-/g, ""));
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const partStatus = useAuiState((s) => s.part?.status);
  const isComplete = partStatus?.type === "complete";
  const theme = useStore(s => s.settings.theme);

  useEffect(() => {
    if (!isComplete) return;

    let cancelled = false;

    mermaid
      .render(idRef.current, code)
      .then(({ svg }) => {
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setSvg(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, isComplete, theme]);

  if (!isComplete || (error && !svg)) {
    return (
      <pre className="aui-md-pre overflow-x-auto rounded-lg border border-border/50 bg-muted/30 p-3 text-xs leading-relaxed">
        <code className="language-mermaid">{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="mermaid-diagram my-2.5 overflow-auto rounded-lg border border-border/50 bg-muted/30 p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
