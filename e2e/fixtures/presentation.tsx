import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../../src/theme";
import { useDashboard } from "../../src/lib/use-dashboard";
import "@fontsource-variable/montserrat";
import "../../src/styles.css";
import { Presentation } from "../../src/views/Presentation";
const range = { start: "2026-10-01", end: "2026-10-22" };
const artwork = (width: number, height: number) => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#21333d"/><rect x="2%" y="2%" width="96%" height="96%" fill="none" stroke="#d7982b" stroke-width="8"/><circle cx="50%" cy="50%" r="20%" fill="#9d2a1e"/><text x="50%" y="12%" fill="white" text-anchor="middle" font-family="sans-serif" font-size="40">TESTE ${width} × ${height}</text><text x="50%" y="90%" fill="white" text-anchor="middle" font-family="sans-serif" font-size="30">CONTEÚDO COMPLETO</text></svg>`);
function Fixture() {
  const data = useDashboard(range);
  const [commercialDemo, setCommercialDemo] = useState(false);
  if (data.isLoading) return <p>Carregando dados de teste...</p>;
  const seed = data.creatives.find(c => c.channel === "meta_ads")!;
  const creatives = (["franchise", "condominium"] as const).flatMap(front => Array.from({length: 7}, (_, i) => ({...seed,
    id: `${front}-${i}`, front, channel: "meta_ads" as const, creative_type: i === 2 ? "dynamic" as const : i === 5 ? "image" as const : "video" as const,
    preview_media_type: i === 5 ? "image" as const : "video" as const, preview_url: i === 6 ? artwork(64,64) : artwork(i % 2 ? 1920 : 1080, i % 2 ? 1080 : 1920), name: `Fixture ${front} ${i + 1}`,
    leads: 70 - i, cpl: 12.97, ctr: 1.25,
  })));
  return <Presentation data={{...data,creatives,all:{...data.all,current:{...data.all.current,spend:6238.36,cpl:12.97}}}} range={range}
    commercialDemo={commercialDemo} onCommercialDemoChange={setCommercialDemo} onExit={() => { document.body.dataset.exited = "true"; }} />;
}
const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><ThemeProvider><Fixture/></ThemeProvider></QueryClientProvider>);
