import { describe, expect, it } from "vitest";
import { defaultManualData, normalize } from "./manual-inputs";

// A tela de Orgânico trocou "Entrega do mês" (posts/stories vs. meta contratada)
// por "Conteúdos postados no mês" (Feed/Stories/Reels/Carrossel/Instant). Os
// dois primeiros campos continuam com o mesmo nome de chave porque também
// alimentam o "Ritmo do mês"; os três novos (reels/carousel/instant) precisam
// sobreviver à normalização e um payload salvo antes deles existirem não pode
// quebrar a leitura.

describe("normalize() — payload manual de conteúdos (delivery)", () => {
  it("payload legado com só 2 campos recebe os 3 novos campos com o padrão", () => {
    const legacy = { delivery: { posts_published: 20, stories_published: 12 } };
    const result = normalize(legacy);
    expect(result.delivery.posts_published).toBe(20);
    expect(result.delivery.stories_published).toBe(12);
    expect(result.delivery.reels_published).toBe(defaultManualData.delivery.reels_published);
    expect(result.delivery.carousel_published).toBe(defaultManualData.delivery.carousel_published);
    expect(result.delivery.instant_published).toBe(defaultManualData.delivery.instant_published);
  });

  it("payload completo com os 5 campos passa por inteiro", () => {
    const full = { delivery: { posts_published: 8, stories_published: 6, reels_published: 4, carousel_published: 3, instant_published: 2 } };
    expect(normalize(full).delivery).toEqual({ posts_published: 8, stories_published: 6, reels_published: 4, carousel_published: 3, instant_published: 2 });
  });

  it("campos de módulos removidos (entregas do contrato, WhatsApp) são descartados", () => {
    const stale = {
      delivery: {
        posts_published: 5, stories_published: 5,
        creatives_delivered: 19, creatives_goal: 24, videos_delivered: 5, videos_goal: 8,
        weekly_reports: 2, weekly_reports_goal: 4,
      },
    };
    const result = normalize(stale);
    expect(Object.keys(result.delivery).sort()).toEqual(
      ["carousel_published", "instant_published", "posts_published", "reels_published", "stories_published"].sort(),
    );
  });

  it("valores negativos são travados em 0; NaN e ausentes caem no padrão", () => {
    const dirty = { delivery: { posts_published: -3, stories_published: Number.NaN, reels_published: 7 } };
    const result = normalize(dirty);
    expect(result.delivery.posts_published).toBe(0); // finito, mas negativo → Math.max(0, ...)
    expect(result.delivery.stories_published).toBe(defaultManualData.delivery.stories_published); // NaN não é finito → padrão
    expect(result.delivery.reels_published).toBe(7);
    expect(result.delivery.carousel_published).toBe(defaultManualData.delivery.carousel_published); // ausente → padrão
  });

  it("payload totalmente ausente devolve os padrões de demonstração", () => {
    expect(normalize(undefined).delivery).toEqual(defaultManualData.delivery);
    expect(normalize({}).delivery).toEqual(defaultManualData.delivery);
  });
});
