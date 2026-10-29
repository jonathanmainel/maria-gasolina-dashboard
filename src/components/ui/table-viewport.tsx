import { useEffect, useId, useRef, useState, type PropsWithChildren } from "react";

/** Keeps wide tables readable without making the page itself scroll sideways. */
export function TableViewport({ label, children }: PropsWithChildren<{ label: string }>) {
  const viewport = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (active) setOverflow(element.scrollWidth > element.clientWidth + 1);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    measure();
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className="desktop-table">
      <div
        className="table-scroll"
        ref={viewport}
        role={overflow ? "region" : undefined}
        aria-label={overflow ? label : undefined}
        aria-describedby={overflow ? hintId : undefined}
        tabIndex={overflow ? 0 : undefined}
      >
        {children}
      </div>
      {overflow && <p className="table-scroll-hint" id={hintId}>Mais colunas à direita ou à esquerda. Role horizontalmente; com foco na tabela, use as setas.</p>}
    </div>
  );
}
