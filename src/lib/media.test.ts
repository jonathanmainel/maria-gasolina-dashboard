import { describe, expect, it } from "vitest";
import { viewableImage } from "./media";

describe("imagem que pode ser ampliada", () => {
  it("aceita URLs http(s) e data:image", () => {
    expect(viewableImage("https://tpc.googlesyndication.com/simgad/123")).toBe("https://tpc.googlesyndication.com/simgad/123");
    expect(viewableImage("http://exemplo.com/a.png")).toBe("http://exemplo.com/a.png");
    expect(viewableImage("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });

  it("ignora espaços nas bordas", () => {
    expect(viewableImage("  https://exemplo.com/a.png  ")).toBe("https://exemplo.com/a.png");
  });

  it("recusa ausente, vazio e esquemas que não são imagem", () => {
    expect(viewableImage(null)).toBeNull();
    expect(viewableImage(undefined)).toBeNull();
    expect(viewableImage("")).toBeNull();
    expect(viewableImage("   ")).toBeNull();
    expect(viewableImage("javascript:alert(1)")).toBeNull();
    expect(viewableImage("data:text/html,<b>x</b>")).toBeNull();
    expect(viewableImage("/relativo.png")).toBeNull();
  });
});
