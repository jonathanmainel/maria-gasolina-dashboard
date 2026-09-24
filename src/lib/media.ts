// Só abrimos a visualização ampliada para uma URL de imagem que o navegador
// consegue de fato carregar. Texto, vídeo do YouTube e campo vazio não abrem nada.

const VIEWABLE = /^(https?:\/\/|data:image\/)/i;

export function viewableImage(url: string | null | undefined): string | null {
  const value = url?.trim();
  return value && VIEWABLE.test(value) ? value : null;
}
