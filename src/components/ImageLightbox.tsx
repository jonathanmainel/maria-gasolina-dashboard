import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { previewQuality } from "../lib/preview-quality";

// Visualização ampliada de um recurso de imagem. Vai para `document.body` pelo
// mesmo motivo do Popover: os painéis e a tabela usam backdrop-filter e criam
// stacking context próprio, então um overlay renderizado dentro deles ficaria
// preso abaixo da sidebar e da topbar.

interface Props {
  src: string;
  /** Nome do recurso: vira o rótulo acessível do diálogo e a legenda. */
  label: string;
  onClose: () => void;
  refreshSrc?: () => Promise<string | null>;
}

export function ImageLightbox({ src, label, onClose, refreshSrc }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setResolvedSrc(src); setFailed(false); setDimensions({ width: 0, height: 0 }); retried.current = false; }, [src]);
  const quality = previewQuality(dimensions.width, dimensions.height);
  const recover = async () => {
    if (!retried.current && refreshSrc) {
      retried.current = true;
      try { const renewed = await refreshSrc(); if (mounted.current && renewed && renewed !== resolvedSrc) { setResolvedSrc(renewed); return; } } catch { /* Explain the failure inside the dialog. */ }
    }
    if (mounted.current) setFailed(true);
  };

  useEffect(() => {
    // Foco no botão de fechar ao abrir; ao fechar, volta para a miniatura.
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      // O fechar é o único controle do diálogo: Tab não deixa o foco escapar.
      if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="overlay-layer">
      <div className="lightbox-backdrop" data-testid="lightbox-backdrop" onClick={onClose} />
      <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Imagem ampliada: ${label}`}>
        <button ref={closeRef} type="button" className="lightbox-close" aria-label="Fechar imagem ampliada" onClick={onClose}>
          <X size={18} />
        </button>
        <figure>
          <div className="lightbox-media">
            <div className={`lightbox-frame${dimensions.height > dimensions.width ? " lightbox-frame-vertical" : ""}`}>
            {failed ? <p role="status" className="lightbox-error">Não foi possível carregar esta imagem. Feche e abra novamente para tentar renovar o acesso.</p> :
              <img src={resolvedSrc} alt={label}
                style={quality.limited ? { maxWidth: dimensions.width * 2, maxHeight: dimensions.height * 2 } : undefined}
                onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                onError={() => { void recover(); }} />}
            </div>
          </div>
          <figcaption>{label}
            {!failed && quality.known && <small className={quality.limited ? "lightbox-resolution-limited" : ""}>
              {quality.label}{quality.limited ? " · A origem tem baixa resolução. Ampliação limitada a 2× para preservar a leitura." : ""}
            </small>}
          </figcaption>
        </figure>
      </div>
    </div>,
    document.body,
  );
}
