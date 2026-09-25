import { MapPinOff } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";
import { integer } from "../lib/format";
import { networkStateCount, toMapCities, unitCountLabel, useNetworkUnits } from "../lib/network-units";
import { AnimatedNumber } from "./ui/primitives";

const BrazilMap = lazy(() => import("./three/BrazilMap").then((m) => ({ default: m.BrazilMap })));

// ---------------------------------------------------------------------------
// Hero da Visão executiva: a presença real da rede
//
// Fonte única: a RPC `get_dashboard_network_units`. Um marcador por cidade,
// dimensionado pela contagem de unidades daquela cidade, e a sede sinalizada no
// próprio ponto de Campinas. Nenhum número aqui é constante no código — todos
// saem do retorno da RPC.
//
// O mapa depende de rede, então o bloco tem três estados: carregando (mantendo
// a moldura do hero), indisponível (sem cair para dado inventado) e carregado.
// Nenhum deles derruba o resto da Visão executiva.
// ---------------------------------------------------------------------------

function HeroFrame({ children }: { children: React.ReactNode }) {
  return <section className="panel hero">{children}</section>;
}

function HeroCopy() {
  return (
    <div className="hero-copy">
      <span className="eyebrow"><i style={{ background: "var(--red)" }} />Rede em expansão</span>
      <h2>Onde a Maria Gasolina já está</h2>
      <p>Presença atual da rede pelo Brasil, com as unidades agrupadas por cidade. Passe o mouse sobre um ponto para ver a cidade e quantas unidades ela tem.</p>
    </div>
  );
}

export function NetworkHero() {
  const { data, isPending, isError } = useNetworkUnits();

  const mapCities = useMemo(() => (data ? toMapCities(data) : []), [data]);
  const stateCount = useMemo(() => (data ? networkStateCount(data.cities) : 0), [data]);

  if (isPending) {
    return (
      <HeroFrame>
        <HeroCopy />
        <div className="hero-stats">
          {["Unidades", "Cidades", "Estados"].map((label) => (
            <div className="hero-stat" key={label}>
              <small>{label}</small>
              <strong><span className="skeleton hero-stat-skeleton" /></strong>
            </div>
          ))}
        </div>
        <div className="hero-loading" role="status">Carregando a distribuição das unidades…</div>
      </HeroFrame>
    );
  }

  if (isError || !data) {
    return (
      <HeroFrame>
        <HeroCopy />
        <div className="hero-unavailable" role="status">
          <MapPinOff size={20} />
          <strong>Não foi possível carregar a distribuição das unidades.</strong>
          <span>Os demais blocos desta tela seguem atualizados. Recarregue a página para tentar de novo.</span>
        </div>
      </HeroFrame>
    );
  }

  const { summary } = data;
  const empty = summary.total_units === 0;

  return (
    <HeroFrame>
      {!empty && <Suspense fallback={null}><BrazilMap cities={mapCities} /></Suspense>}
      <HeroCopy />
      {empty ? (
        <div className="hero-unavailable" role="status">
          <MapPinOff size={20} />
          <strong>Nenhuma unidade importada ainda.</strong>
          <span>Envie a planilha da base em Metas e ajustes para o mapa aparecer aqui.</span>
        </div>
      ) : (
        <>
          <div className="hero-stats">
            <div className="hero-stat"><small>Unidades</small><strong><AnimatedNumber value={summary.total_units} format={integer} /></strong></div>
            <div className="hero-stat"><small>Cidades</small><strong><AnimatedNumber value={summary.total_cities} format={integer} /></strong></div>
            <div className="hero-stat"><small>Estados</small><strong><AnimatedNumber value={stateCount} format={integer} /></strong></div>
          </div>
          <div className="hero-legend">
            <span><i style={{ background: "var(--gold)" }} />Sede</span>
            <span><i style={{ background: "var(--red)" }} />Unidades</span>
          </div>
          {/* O canvas é `aria-hidden`: esta lista é a leitura acessível do mapa,
              e é ela que garante que a sede seja anunciada como sede em vez de
              depender do dourado. */}
          <ul className="sr-only">
            {mapCities.map((city) => (
              <li key={city.key}>
                {city.city} · {city.state}
                {city.isHeadquarters ? " · Sede" : ""}
                {`: ${unitCountLabel(city.unitCount)}`}
              </li>
            ))}
            {summary.unresolved_cities > 0 && (
              <li>
                {summary.unresolved_cities === 1
                  ? "1 cidade sem localização no mapa."
                  : `${summary.unresolved_cities} cidades sem localização no mapa.`}
              </li>
            )}
          </ul>
        </>
      )}
    </HeroFrame>
  );
}
