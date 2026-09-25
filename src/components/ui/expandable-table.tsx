import { useMemo, useState } from "react";
import { integer } from "../../lib/format";

// ---------------------------------------------------------------------------
// Comportamento único das tabelas analíticas do dashboard.
//
// A ordem é sempre: dataset completo → filtros → ordenação → Top N → render.
// O recorte acontece DEPOIS da ordenação, então trocar de coluna transforma a
// tabela num ranking daquele critério — nunca uma reordenação das 5 linhas que
// por acaso já estavam na tela.
//
// "Ver mais" aqui não é paginação de rede: as RPCs já foram percorridas até o
// fim antes de a tabela existir. É só revelação visual, por isso revela tudo de
// uma vez em vez de avançar de 5 em 5.
// ---------------------------------------------------------------------------

/** Quantas linhas uma tabela analítica mostra antes de o usuário pedir mais. */
export const DEFAULT_TABLE_PREVIEW_ROWS = 5;

export interface ExpandableRows<T> {
  /** As linhas que devem ser renderizadas agora. */
  visibleRows: T[];
  expanded: boolean;
  total: number;
  /** Quantas linhas estão escondidas no estado recolhido. */
  hiddenCount: number;
  /** Falso quando o dataset cabe no recorte — aí não existe ação no rodapé. */
  canExpand: boolean;
  expand: () => void;
  collapse: () => void;
  toggle: () => void;
}

/**
 * Recebe as linhas **já ordenadas** e devolve só o topo delas.
 *
 * `resetKey` descreve o que, se mudar, invalida semanticamente a expansão:
 * coluna e direção da ordenação, nível do detalhamento, canal, frente,
 * período. Quando ela muda, a tabela volta sozinha para o estado recolhido —
 * manter 90 linhas abertas depois que o usuário trocou a análise inteira só
 * atrapalha. O ajuste é feito durante o render (e não num efeito) para a tela
 * nunca chegar a pintar a lista antiga expandida.
 */
export function useExpandableRows<T>(
  rows: T[],
  resetKey: string,
  collapsedCount: number = DEFAULT_TABLE_PREVIEW_ROWS,
): ExpandableRows<T> {
  const [state, setState] = useState({ expanded: false, key: resetKey });
  if (state.key !== resetKey) setState({ expanded: false, key: resetKey });
  const expanded = state.key === resetKey && state.expanded;

  const visibleRows = useMemo(
    () => (expanded ? rows : rows.slice(0, collapsedCount)),
    [rows, expanded, collapsedCount],
  );

  return {
    visibleRows,
    expanded,
    total: rows.length,
    hiddenCount: Math.max(0, rows.length - collapsedCount),
    canExpand: rows.length > collapsedCount,
    expand: () => setState({ expanded: true, key: resetKey }),
    collapse: () => setState({ expanded: false, key: resetKey }),
    toggle: () => setState((current) => ({ expanded: !current.expanded, key: resetKey })),
  };
}

/**
 * Rodapé padrão: contagem à esquerda, ação à direita (empilhadas no mobile).
 * Sem ação quando tudo já está visível — um botão "Ver mais (0)" seria ruído.
 */
export function ExpandableTableFooter<T>({ rows, summary }: { rows: ExpandableRows<T>; summary?: string }) {
  return (
    <div className="table-foot">
      <p className="table-count">
        Exibindo {integer(rows.visibleRows.length)} de {integer(rows.total)}{summary ? ` · ${summary}` : ""}
      </p>
      {rows.canExpand && (
        <button type="button" className="table-toggle" aria-expanded={rows.expanded} onClick={rows.toggle}>
          {rows.expanded ? "Mostrar menos" : `Ver mais (${integer(rows.hiddenCount)})`}
        </button>
      )}
    </div>
  );
}
