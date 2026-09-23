import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

// Por que um portal e não `position: absolute` dentro da topbar:
// a `.topbar` combina `z-index: 35` com `backdrop-filter`, e a `.sidebar` usa
// `z-index: 40`. Isso faz a topbar criar um *stacking context* próprio — qualquer
// z-index de um filho dela (mesmo 999999) continua sendo pintado dentro da faixa 35,
// ou seja, sempre abaixo da sidebar e do scrim. Além disso, `backdrop-filter` no
// ancestral transforma `position: fixed` em "fixo em relação à topbar", o que
// quebrava o modo folha (sheet) no mobile.
// A solução correta é tirar o painel da árvore da topbar: ele é renderizado em
// `document.body`, dentro de uma camada única (`.overlay-layer`) que fica acima de
// todo o cromo da interface pela escala de z-index declarada em `styles.css`.

const GUTTER = 12;
const SHEET_BREAKPOINT = 640;

interface Props {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  children: ReactNode;
  /** Largura fixa do painel no desktop; no mobile o painel vira folha e ignora este valor. */
  width?: number;
  align?: "start" | "end";
  className?: string;
}

export function Popover({ open, onClose, anchorRef, label, children, width, align = "end", className = "" }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    // Modo folha: posição vem do CSS, sem inline style que o sobrescreva.
    if (vw <= SHEET_BREAKPOINT) { setStyle({}); return; }

    const rect = anchor.getBoundingClientRect();
    const panelWidth = Math.min(width ?? panel.offsetWidth, vw - GUTTER * 2);
    const panelHeight = panel.offsetHeight;

    let left = align === "end" ? rect.right - panelWidth : rect.left;
    left = Math.min(Math.max(GUTTER, left), Math.max(GUTTER, vw - panelWidth - GUTTER));

    let top = rect.bottom + 8;
    if (top + panelHeight > vh - GUTTER) {
      const above = rect.top - 8 - panelHeight;
      top = above >= GUTTER ? above : Math.max(GUTTER, vh - panelHeight - GUTTER);
    }

    setStyle({ top, left, width: panelWidth, maxHeight: vh - GUTTER * 2 });
  }, [align, anchorRef, width]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    // `capture` para reagir também a rolagens de contêineres internos.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="overlay-layer">
      {/* O backdrop cobre a tela inteira: fecha ao clique fora e impede que o clique
          no próprio gatilho reabra o painel imediatamente. */}
      <div className="overlay-backdrop" onMouseDown={onClose} />
      <div ref={panelRef} className={`overlay-panel ${className}`} style={style} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
