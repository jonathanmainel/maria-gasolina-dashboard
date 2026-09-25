import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { delta } from "../../lib/format";

// Número animado — conta do valor anterior até o novo valor sempre que `value` muda,
// e conta a partir de zero na primeira renderização. Não depende de o elemento estar
// visível na tela: em alguns contêineres embutidos (iframes de preview, painéis
// recolhidos) o IntersectionObserver nunca reporta interseção, e um contador que só
// anima "quando entra em vista" fica travado em zero para sempre — por isso a animação
// dispara direto no mount/troca de valor, com o texto correto sempre disponível como base.
export function AnimatedNumber({ value, format, duration = 1.2 }: { value: number | null | undefined; format: (n: number) => string; duration?: number }) {
  const reduce = useReducedMotion();
  const prevValue = useRef<number>(0);
  const hasRun = useRef(false);
  const [text, setText] = useState(() => (value == null ? "—" : format(value)));
  useEffect(() => {
    if (value == null) { setText("—"); return; }
    if (reduce) { setText(format(value)); prevValue.current = value; hasRun.current = true; return; }
    const from = hasRun.current ? prevValue.current : 0;
    hasRun.current = true;
    prevValue.current = value;
    if (from === value) { setText(format(value)); return; }
    const controls = animate(from, value, { duration, ease: [0.2, 0.7, 0.2, 1], onUpdate: (v) => setText(format(v)) });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, duration]);
  return <span>{text}</span>;
}

// Tilt 3D controlado por mouse, sem re-render (escreve custom properties direto no DOM).
// Aplique a classe "tilt" no elemento junto com o ref/handlers retornados aqui.
export function useTilt<T extends HTMLElement>(strength = 7) {
  const ref = useRef<T>(null);
  const raf = useRef<number | undefined>(undefined);
  const onMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--tilt-x", `${(-py * strength).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(px * strength).toFixed(2)}deg`);
      el.style.setProperty("--glow-x", `${(px * 100 + 50).toFixed(1)}%`);
      el.style.setProperty("--glow-y", `${(py * 100 + 50).toFixed(1)}%`);
    });
  };
  const onMouseLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };
  return { ref, onMouseMove, onMouseLeave };
}

export function Delta({ current, previous, lowerIsBetter = false, suffix = "" }: { current?: number | null; previous?: number | null; lowerIsBetter?: boolean; suffix?: string }) {
  const change = delta(current, previous);
  if (change == null) return <span className="delta flat"><Minus size={12} strokeWidth={2.5} />s/ comparação</span>;
  const up = change >= 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className={`delta ${good ? "up" : "down"}`}><Icon size={12} strokeWidth={2.6} />{Math.abs(change).toFixed(1).replace(".", ",")}%{suffix}</span>;
}

export function Sparkline({ points, color = "var(--gold)", className = "kpi-spark", fill = true }: { points: number[]; color?: string; className?: string; fill?: boolean }) {
  const w = 100; const h = 36;
  const max = Math.max(...points, 1); const min = Math.min(...points, 0);
  const span = max - min || 1;
  const coords = points.map((p, i) => [points.length > 1 ? (i / (points.length - 1)) * w : 0, h - ((p - min) / span) * (h - 4) - 2]);
  const d = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = useRef(`sp${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {fill && <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface KpiProps {
  label: string;
  value: number | null | undefined;
  format: (n: number) => string;
  previous?: number | null;
  previousLabel?: string;
  accent?: "red" | "gold" | "green" | "violet" | "sky" | "navy";
  icon?: ReactNode;
  lowerIsBetter?: boolean;
  spark?: number[];
  foot?: ReactNode;
  hideDelta?: boolean;
}

const accentColor: Record<NonNullable<KpiProps["accent"]>, string> = { red: "var(--red)", gold: "var(--gold)", green: "var(--green)", violet: "var(--violet)", sky: "var(--sky)", navy: "var(--navy)" };

export function Kpi({ label, value, format, previous, previousLabel, accent = "navy", icon, lowerIsBetter, spark, foot, hideDelta }: KpiProps) {
  const tilt = useTilt<HTMLElement>(6);
  return (
    <article ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className={`kpi tilt ${accent} ${spark && spark.length > 1 ? "has-spark" : ""}`}>
      <div className="kpi-top"><p>{label}</p>{icon && <span className="kpi-icon">{icon}</span>}</div>
      <div className="kpi-value">
        <strong><AnimatedNumber value={value} format={format} /></strong>
        {!hideDelta && <Delta current={value} previous={previous} lowerIsBetter={lowerIsBetter} />}
      </div>
      <div className="kpi-foot">
        <span>{foot ?? (previous != null && previous !== 0 ? `${previousLabel ?? format(previous)} no período anterior` : "")}</span>
      </div>
      {spark && spark.length > 1 && <Sparkline points={spark} color={accentColor[accent]} />}
    </article>
  );
}

export function Panel({ title, description, badge, children, className = "", actions, noTilt }: { title?: string; description?: string; badge?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode; noTilt?: boolean }) {
  const tilt = useTilt<HTMLElement>(2.4);
  return (
    <section ref={noTilt ? undefined : tilt.ref} onMouseMove={noTilt ? undefined : tilt.onMouseMove} onMouseLeave={noTilt ? undefined : tilt.onMouseLeave} className={`panel ${noTilt ? "" : "tilt"} ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          <div>{title && <h3>{title}</h3>}{description && <p>{description}</p>}</div>
          {badge}{actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ id: T; label: string; className?: string }> }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={`${o.className ?? ""} ${value === o.id ? "active" : ""}`} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

export function Ring({ value, label, sub, color = "var(--gold)", format }: { value: number; label: string; sub?: string; color?: string; format?: (n: number) => string }) {
  const r = 36; const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const [dash, setDash] = useState(c);
  useEffect(() => { const t = window.setTimeout(() => setDash(c - (c * pct) / 100), 80); return () => window.clearTimeout(t); }, [pct, c]);
  return (
    <div className="ring" style={{ "--rc": color } as React.CSSProperties}>
      <div className="ring-wrap">
        <svg viewBox="0 0 84 84"><circle className="track" cx="42" cy="42" r={r} /><circle className="fill" cx="42" cy="42" r={r} strokeDasharray={c} strokeDashoffset={dash} /></svg>
        <strong>{format ? format(value) : `${Math.round(pct)}%`}</strong>
      </div>
      <small>{label}</small>
      {sub && <b>{sub}</b>}
    </div>
  );
}

export function Pacing({ label, actual, goal, ratio, color, format, lowerIsBetter = false }: { label: string; actual: number; goal: number; ratio: number; color: string; format: (n: number) => string; lowerIsBetter?: boolean }) {
  const realPct = goal ? (actual / goal) * 100 : 0;
  const barPct = Math.max(0, Math.min(100, realPct));
  const over = realPct > 100;
  const expected = goal * ratio;
  const projected = ratio > 0 ? actual / ratio : 0;
  const ahead = lowerIsBetter ? actual <= expected : actual >= expected;
  const [w, setW] = useState(0);
  useEffect(() => { const t = window.setTimeout(() => setW(barPct), 120); return () => window.clearTimeout(t); }, [barPct]);
  return (
    <div className="pacing" style={{ "--pc": color } as React.CSSProperties}>
      <div className="pacing-label"><i />{label}</div>
      <div className="pacing-values"><b>{format(actual)}</b> de {format(goal)}</div>
      <div className="pacing-track">
        <div className="pacing-fill" style={{ width: `${w}%` }} />
        {over && <div className="pacing-overflow" title="Superou a meta" />}
        <div className="pacing-mark" style={{ left: `${Math.min(100, ratio * 100)}%` }} data-label="hoje" />
      </div>
      <div className="pacing-foot">
        <span>{Math.round(realPct)}% da meta{over && " · superada"}</span>
        <span style={{ color: ahead ? "var(--green)" : "var(--red)" }}>{ahead ? "no ritmo" : "abaixo do ritmo"} · projeção {format(projected)}</span>
      </div>
    </div>
  );
}

export interface FunnelStage { id?: string; name: string; kind?: "commercial" | "close" | "post_sale"; count: number; avg_days?: number; previous_count?: number }

// Funil de vendas de verdade: cada etapa é um trapézio que afunila proporcionalmente
// à queda real de volume (não apenas barras do mesmo formato encolhendo). Partículas
// escoam continuamente pelo centro (a "dimensão temporal" do funil) e o card inteiro
// reage à posição do mouse com um leve tilt 3D.
export function Funnel({ stages, color, format, dense = false }: { stages: FunnelStage[]; color: string; format: (n: number) => string; dense?: boolean }) {
  const max = stages[0]?.count || 1;
  const [ready, setReady] = useState(false);
  const tilt = useTilt<HTMLDivElement>(5);
  useEffect(() => { const t = window.setTimeout(() => setReady(true), 90); return () => window.clearTimeout(t); }, []);
  // A altura por etapa encolhe conforme o funil cresce: com as 10 etapas de
  // Franquias, 60px fixos passavam de 600px e o funil deixava de caber na tela.
  const stageH = dense ? Math.max(34, Math.min(46, Math.round(400 / stages.length))) : Math.max(44, Math.min(60, Math.round(540 / stages.length)));
  const gap = 4;
  const rowH = stageH + gap;
  const totalH = stages.length * rowH - gap;
  const shapeW = 220;
  return (
    <div className={`funnel3d tilt ${dense ? "dense" : ""}`} style={{ "--fc": color } as React.CSSProperties} ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave}>
      <div className="funnel3d-shape">
        <div className="funnel3d-flow" aria-hidden>{Array.from({ length: 6 }).map((_, i) => <span key={i} style={{ left: `${16 + i * 13}%`, animationDelay: `${i * 0.55}s` }} />)}</div>
        <svg viewBox={`0 0 ${shapeW} ${totalH}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            {stages.map((_, i) => (
              <linearGradient id={`fnl-${i}`} key={i} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.95 - i * 0.06} />
                <stop offset="100%" stopColor={color} stopOpacity={0.42 - i * 0.05} />
              </linearGradient>
            ))}
          </defs>
          {stages.map((s, i) => {
            const topW = Math.max(shapeW * 0.1, (s.count / max) * shapeW);
            const nextCount = stages[i + 1]?.count ?? s.count * 0.93;
            const botW = Math.max(shapeW * 0.08, Math.min(topW, (nextCount / max) * shapeW));
            const y = i * rowH;
            const rest = shapeW / 2;
            const [tx0, tx1] = ready ? [rest - topW / 2, rest + topW / 2] : [rest - 6, rest + 6];
            const [bx0, bx1] = ready ? [rest - botW / 2, rest + botW / 2] : [rest - 6, rest + 6];
            return (
              <g key={s.id ?? s.name}>
                <polygon points={`${tx0},${y} ${tx1},${y} ${bx1},${y + stageH} ${bx0},${y + stageH}`} fill={`url(#fnl-${i})`} stroke="rgba(255,255,255,.16)" strokeWidth="0.7" style={{ transition: "all .9s cubic-bezier(.2,.7,.2,1)", transitionDelay: `${i * 80}ms` }} />
                <line x1={tx0} y1={y + 1.4} x2={tx1} y2={y + 1.4} stroke="rgba(255,255,255,.4)" strokeWidth="1" style={{ transition: "all .9s cubic-bezier(.2,.7,.2,1)", transitionDelay: `${i * 80}ms` }} />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="funnel3d-rows">
        {stages.map((s, i) => {
          const prevStage = i ? stages[i - 1].count : null;
          const rate = prevStage ? (s.count * 100) / prevStage : null;
          const lostHere = prevStage != null ? prevStage - s.count : 0;
          const postSale = s.kind === "post_sale";
          return (
            // `--w` desenha a barra proporcional que substitui o trapézio no
            // mobile, onde a coluna do desenho é escondida para não empilhar
            // dois blocos altíssimos com 10 etapas.
            <div
              className={`funnel3d-row ${postSale ? "post-sale" : ""}`}
              key={s.id ?? s.name}
              style={{ height: rowH, "--w": `${Math.max(6, (s.count / max) * 100)}%` } as React.CSSProperties}
            >
              <div className="funnel3d-row-top">
                <strong>{s.name}</strong>
                {postSale && <span className="funnel3d-tag">pós-venda</span>}
                {s.avg_days != null && s.avg_days > 0 && <span className="funnel3d-days">~{Math.round(s.avg_days)}d nesta etapa</span>}
              </div>
              <div className="funnel3d-row-bottom">
                <b><AnimatedNumber value={s.count} format={format} /></b>
                {postSale ? <em>lojas em implantação</em> : rate != null ? <em>{rate.toFixed(0)}% seguiu · {format(lostHere)} saíram</em> : <em>topo do funil</em>}
                {s.previous_count != null && <Delta current={s.count} previous={s.previous_count} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Barra horizontal empilhada mostrando a composição do ciclo médio de venda por etapa.
export function CycleBar({ stages, color, totalDays }: { stages: FunnelStage[]; color: string; totalDays: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setReady(true), 100); return () => window.clearTimeout(t); }, []);
  const segs = stages.filter((s) => (s.avg_days ?? 0) > 0);
  return (
    <div className="cycle-bar-wrap">
      <div className="cycle-bar">
        {segs.map((s, i) => (
          <div key={s.id ?? s.name} className="cycle-seg" title={`${s.name}: ~${s.avg_days}d`} style={{ width: ready ? `${((s.avg_days ?? 0) / totalDays) * 100}%` : 0, background: `color-mix(in srgb, ${color} ${95 - i * 14}%, transparent)` }} />
        ))}
      </div>
      <div className="cycle-bar-legend">
        {segs.map((s) => <span key={s.id ?? s.name}><i style={{ background: color }} />{s.name.split(" / ")[0]} <b>{s.avg_days}d</b></span>)}
      </div>
    </div>
  );
}

export function BarList({ items, format, color }: { items: Array<{ name: string; value: number; color?: string; hint?: string }>; format: (n: number) => string; color?: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setReady(true), 60); return () => window.clearTimeout(t); }, []);
  return (
    <div className="bar-list">
      {items.map((it) => (
        <div className="bar-item" key={it.name} style={{ "--bc": it.color ?? color ?? "var(--navy)" } as React.CSSProperties}>
          <span className="name"><i />{it.name}</span>
          <span className="val"><b>{format(it.value)}</b>{it.hint ? ` · ${it.hint}` : ""}</span>
          <div className="track"><span style={{ width: ready ? `${(it.value / max) * 100}%` : 0 }} /></div>
        </div>
      ))}
    </div>
  );
}

export function ChartTip({ active, payload, label, format }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string; dataKey?: string }>; label?: string; format: (n: number, key?: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <strong>{label}</strong>
      {payload.map((p) => <div key={String(p.dataKey ?? p.name)}><span><i style={{ background: p.color }} />{p.name}</span><b>{format(Number(p.value), String(p.dataKey))}</b></div>)}
    </div>
  );
}

export function Skeleton({ height = 160, className = "" }: { height?: number; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height }} />;
}
