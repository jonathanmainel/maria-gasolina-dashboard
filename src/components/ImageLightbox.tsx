import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Visualização ampliada de um recurso de imagem. Vai para `document.body` pelo
// mesmo motivo do Popover: os painéis e a tabela usam backdrop-filter e criam
// stacking context próprio, então um overlay renderizado dentro deles ficaria
// preso abaixo da sidebar e da topbar.

interface Props {
  src: string;
  /** Nome do recurso: vira o rótulo acessível do diálogo e a legenda. */
  label: string;
  onClose: () => void;
}

export function ImageLightbox({ src, label, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Foco no botão de fechar ao abrir; ao fechar, volta para a miniatura.
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      // O fechar é o único controle do diálogo: Tab não deixa o foco escapar.
      if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
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
          <img src={src} alt={label} />
          <figcaption>{label}</figcaption>
        </figure>
      </div>
    </div>,
    document.body,
  );
}
