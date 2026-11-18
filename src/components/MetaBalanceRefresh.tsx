import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { financeQueryKey } from "../lib/retaguarda-finance";
import { loadMetaBalanceStatus, metaBalanceMessage, requestMetaBalance } from "../lib/meta-balance";

export function MetaBalanceRefresh({ userId, canEdit, accountIds, onRefresh }: {
  userId: string; canEdit: boolean; accountIds: string[]; onRefresh: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: [...financeQueryKey, userId, "meta-status"], queryFn: loadMetaBalanceStatus,
    retry: 1, refetchInterval: query => query.state.data?.some(row => row.status === "running" && !row.overdue) ? 3000 : 60000 });
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const keys = useRef(new Map<string, string>());
  const completion = status.data?.map(row => `${row.account_id}:${row.entry_id ?? ""}`).join("|");
  useEffect(() => {
    if (!status.data?.some(row => row.entry_id)) return;
    void queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === financeQueryKey[0]
      && query.queryKey[1] === financeQueryKey[1] && query.queryKey[2] === userId
      && ["entries", "latest"].includes(String(query.queryKey[3])) });
  }, [completion, queryClient, userId]);
  async function refresh(accountId: string) {
    if (lock.current) return;
    lock.current = true; setPending(accountId); setNotice("");
    const key = keys.current.get(accountId) ?? crypto.randomUUID(); keys.current.set(accountId, key);
    try {
      const result = await requestMetaBalance(accountId, key, userId);
      setNotice(result.state === "success" ? "Nova medição confirmada e registrada." : "Coleta sem confirmação de nova medição. Consulte o estado.");
      if (["success", "failed", "conflict"].includes(result.state)) keys.current.delete(accountId);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Coleta não confirmada."); }
    finally {
      await Promise.allSettled([status.refetch(), onRefresh(), queryClient.invalidateQueries({ queryKey: [...financeQueryKey, userId, "latest"] })]);
      setPending(null); lock.current = false;
    }
  }
  return <div className="retaguarda-finance-note" aria-label="Sincronização financeira Meta Ads">
    <p>A consulta financeira é independente da sincronização das campanhas.</p>
    {status.isPending && <p role="status">Consultando estado da coleta financeira…</p>}
    {status.isError && <p role="alert">Estado da coleta financeira indisponível. O último saldo conhecido foi mantido.</p>}
    {accountIds.map(accountId => {
      const current = status.data?.find(row => row.account_id === accountId);
      const blocked = current?.status === "running" || current?.status === "indeterminate" || current?.overdue;
      return <div key={accountId}>
        <p>{accountId} · {metaBalanceMessage(current)}</p>
        {canEdit && <button type="button" className="secondary-button" disabled={!!pending || !!blocked || !status.isSuccess}
          onClick={() => void refresh(accountId)}>{pending === accountId ? "Consultando saldo…" : "Atualizar saldo Meta agora"}</button>}
      </div>;
    })}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
