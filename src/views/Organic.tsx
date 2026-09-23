import { Bookmark, Info, Eye, Heart, MessageCircle, MessagesSquare, Send, TrendingUp, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarList, ChartTip, Kpi, Panel, Ring, Segmented, useTilt } from "../components/ui/primitives";
import { compact, integer, percent, shortDate } from "../lib/format";
import { useGoals } from "../lib/goals";
import { organicSummary } from "../lib/metrics";
import { useChartColors, type DashboardData } from "../lib/use-dashboard";
import type { DateRange, OrganicPost, Platform } from "../types";

type Scope = Platform | "both";

export function OrganicView({ data, range }: { data: DashboardData; range: DateRange }) {
  const colors = useChartColors();
  const goals = useGoals();
  const [scope, setScope] = useState<Scope>("instagram");
  const [metric, setMetric] = useState<"followers" | "reach" | "interactions">("followers");
  const cur = useMemo(() => scope === "both" ? merge(organicSummary(data.organicRows, "instagram"), organicSummary(data.organicRows, "facebook")) : organicSummary(data.organicRows, scope), [data.organicRows, scope]);
  const prev = useMemo(() => scope === "both" ? merge(organicSummary(data.organicPrevRows, "instagram"), organicSummary(data.organicPrevRows, "facebook")) : organicSummary(data.organicPrevRows, scope), [data.organicPrevRows, scope]);
  const series = useMemo(() => {
    const map = new Map<string, { date: string; followers: number; reach: number; interactions: number; new_followers: number }>();
    data.organicRows.filter((r) => scope === "both" || r.platform === scope).forEach((r) => {
      const e = map.get(r.date) ?? { date: r.date, followers: 0, reach: 0, interactions: 0, new_followers: 0 };
      e.followers += r.followers; e.reach += r.reach; e.interactions += r.likes + r.comments + r.shares + r.saves; e.new_followers += r.new_followers;
      map.set(r.date, e);
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [data.organicRows, scope]);
  const posts = useMemo(() => data.posts.filter((p) => scope === "both" || p.platform === scope).sort((a, b) => b.engagement_rate * b.reach - a.engagement_rate * a.reach), [data.posts, scope]);
  const accent = scope === "facebook" ? colors.facebook : scope === "both" ? colors.violet : colors.instagram;
  const interactionMix = [
    { name: "Curtidas", value: cur.likes, color: colors.instagram },
    { name: "Comentários", value: cur.comments, color: colors.gold },
    { name: "Compartilhamentos", value: cur.shares, color: colors.sky },
    { name: "Salvamentos", value: cur.saves, color: colors.violet },
    { name: "Mensagens diretas", value: cur.dms, color: colors.green },
  ];
  const formatMix = (["reel", "carousel", "image"] as const).map((f) => {
    const list = posts.filter((p) => p.format === f);
    const avg = list.length ? list.reduce((s, p) => s + p.engagement_rate, 0) / list.length : 0;
    return { name: f === "reel" ? "Reels" : f === "carousel" ? "Carrossel" : "Imagem única", value: avg, color: f === "reel" ? colors.instagram : f === "carousel" ? colors.gold : colors.sky, hint: `${list.length} posts` };
  });
  const chartData = series.map((d) => ({ label: shortDate(d.date), Seguidores: d.followers, Alcance: d.reach, Interações: d.interactions }));
  const key = metric === "followers" ? "Seguidores" : metric === "reach" ? "Alcance" : "Interações";
  const followersGoalPct = goals.followers_growth ? (cur.new_followers * 100) / goals.followers_growth : 0;

  return (
    <div className="view-enter">
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: "var(--violet)" }} />Presença orgânica · Meta Graph API</span>
          <h1>A marca crescendo <em>sem pagar por clique</em></h1>
          <p>Seguidores, alcance, interações e as publicações que mais converteram atenção em conversa. Números vêm direto da conta oficial via Graph API.</p>
        </div>
        <Segmented value={scope} onChange={setScope} options={[{ id: "instagram", label: "Instagram" }, { id: "facebook", label: "Facebook" }, { id: "both", label: "Ambos" }]} />
      </div>

      {data.organicOrigin === "demo" && (
        <div className="demo-note">
          <Info size={16} />
          <span>
            <b>Dados de demonstração.</b> A ingestão do Instagram e do Facebook orgânicos (Meta Graph API) ainda não existe no backend —
            não há tabela nem RPC para esses números. A tela fica de pé com uma série ilustrativa até a integração ser ligada;
            nenhum número desta seção deve ser usado em relatório.
          </span>
        </div>
      )}

      <div className="grid grid-6">
        <Kpi label="Seguidores" value={cur.followers} previous={prev.followers} format={integer} accent="violet" icon={<Users size={16} />} spark={series.map((d) => d.followers)} />
        <Kpi label="Novos seguidores" value={cur.new_followers} previous={prev.new_followers} format={integer} accent="violet" icon={<UserPlus size={16} />} spark={series.map((d) => d.new_followers)} />
        <Kpi label="Crescimento no período" value={cur.growth_rate} previous={prev.growth_rate} format={percent} accent="green" icon={<TrendingUp size={16} />} />
        <Kpi label="Taxa de engajamento" value={cur.engagement_rate} previous={prev.engagement_rate} format={percent} accent="gold" icon={<Heart size={16} />} />
        <Kpi label="Curtidas" value={cur.likes} previous={prev.likes} format={compact} accent="red" icon={<Heart size={16} />} />
        <Kpi label="Comentários" value={cur.comments} previous={prev.comments} format={integer} accent="sky" icon={<MessageCircle size={16} />} />
      </div>
      <div className="grid grid-4" style={{ marginTop: 14 }}>
        <Kpi label="Alcance" value={cur.reach} previous={prev.reach} format={compact} accent="navy" icon={<Eye size={16} />} spark={series.map((d) => d.reach)} />
        <Kpi label="Compartilhamentos" value={cur.shares} previous={prev.shares} format={integer} accent="navy" icon={<Send size={16} />} />
        <Kpi label="Salvamentos" value={cur.saves} previous={prev.saves} format={integer} accent="navy" icon={<Bookmark size={16} />} />
        <Kpi label="Mensagens diretas (DM)" value={cur.dms} previous={prev.dms} format={integer} accent="green" icon={<MessagesSquare size={16} />} />
      </div>

      <div className="grid grid-hero" style={{ marginTop: 14 }}>
        <Panel title="Curva de crescimento" description="A linha sobe conforme os dias passam: a dimensão temporal do orgânico" actions={<Segmented value={metric} onChange={setMetric} options={[{ id: "followers", label: "Seguidores" }, { id: "reach", label: "Alcance" }, { id: "interactions", label: "Interações" }]} />}>
          <div className="chart-box h-320">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="gO" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity=".5" /><stop offset="100%" stopColor={accent} stopOpacity="0" /></linearGradient></defs>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10.5 }} dy={8} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={54} tick={{ fill: colors.tick, fontSize: 10 }} tickFormatter={(v) => compact(Number(v))} domain={metric === "followers" ? ["dataMin - 200", "dataMax + 100"] : [0, "auto"]} />
                <Tooltip content={<ChartTip format={integer} />} cursor={{ stroke: colors.tick, strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey={key} stroke={accent} strokeWidth={2.8} fill="url(#gO)" isAnimationActive animationDuration={1600} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Entrega do mês" description="O contratado: 20 posts + 20 stories no Instagram">
          <div className="ring-row">
            <Ring value={((data.delivery?.posts_published ?? 0) * 100) / goals.posts} label="Posts no feed" sub={`${data.delivery?.posts_published ?? 0} de ${goals.posts}`} color="var(--violet)" />
            <Ring value={((data.delivery?.stories_published ?? 0) * 100) / goals.stories} label="Stories" sub={`${data.delivery?.stories_published ?? 0} de ${goals.stories}`} color="var(--gold)" />
            <Ring value={followersGoalPct} label="Meta de seguidores" sub={`${integer(cur.new_followers)} de ${integer(goals.followers_growth)}`} color="var(--green)" />
          </div>
          <p style={{ margin: "14px 0 0", color: "var(--muted)", fontSize: 11.5, lineHeight: 1.5 }}>Visitas ao perfil no período: <b style={{ color: "var(--text)" }}>{integer(cur.profile_visits)}</b>. Cada visita é alguém que saiu do conteúdo e foi olhar a marca.</p>
        </Panel>
      </div>

      <div className="section-title"><div><h2>Top 3 publicações</h2><p>As que mais geraram interação proporcional ao alcance.</p></div></div>
      <div className="post-grid">
        {posts.slice(0, 3).map((p, i) => <PostCard key={p.id} p={p} rank={i + 1} />)}
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <Panel title="Interações por tipo" description="Volume absoluto no período">
          <BarList items={interactionMix} format={integer} />
        </Panel>
        <Panel title="Formato que mais engaja" description="Taxa média de engajamento por formato de publicação">
          <BarList items={formatMix} format={percent} />
        </Panel>
      </div>
    </div>
  );
}

function merge(a: ReturnType<typeof organicSummary>, b: ReturnType<typeof organicSummary>): ReturnType<typeof organicSummary> {
  const reach = a.reach + b.reach;
  const inter = a.likes + b.likes + a.comments + b.comments + a.shares + b.shares + a.saves + b.saves;
  const start = a.followers_start + b.followers_start;
  return {
    platform: "instagram", followers: a.followers + b.followers, followers_start: start, new_followers: a.new_followers + b.new_followers, unfollows: a.unfollows + b.unfollows,
    growth_rate: start ? ((a.followers + b.followers - start) * 100) / start : null, reach, impressions: a.impressions + b.impressions,
    likes: a.likes + b.likes, comments: a.comments + b.comments, shares: a.shares + b.shares, saves: a.saves + b.saves, dms: a.dms + b.dms, profile_visits: a.profile_visits + b.profile_visits,
    engagement_rate: reach ? (inter * 100) / reach : null, posts: a.posts + b.posts, stories: a.stories + b.stories,
  };
}

export function PostCard({ p, rank }: { p: OrganicPost; rank: number }) {
  const tilt = useTilt<HTMLElement>(6);
  return (
    <article ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className="post tilt" style={{ "--c1": p.palette[0], "--c2": p.palette[1] } as React.CSSProperties}>
      <div className="post-art">
        <span className="rank">{rank}</span>
        <span className="format">{p.format === "reel" ? "Reel" : p.format === "carousel" ? "Carrossel" : p.format === "story" ? "Story" : "Imagem"}</span>
        <p>{p.caption}</p>
      </div>
      <div className="post-body">
        <div className="meta"><span className={`chip ${p.platform}`}>{p.platform === "instagram" ? "Instagram" : "Facebook"}</span><span>{shortDate(p.published_at)} · alcance {compact(p.reach)} · engaj. {percent(p.engagement_rate)}</span></div>
        <div className="post-stats">
          <div><Heart size={13} /><b>{compact(p.likes)}</b>curtidas</div>
          <div><MessageCircle size={13} /><b>{integer(p.comments)}</b>coment.</div>
          <div><Send size={13} /><b>{integer(p.shares)}</b>compart.</div>
          <div><Bookmark size={13} /><b>{integer(p.saves)}</b>salvos</div>
        </div>
      </div>
    </article>
  );
}
