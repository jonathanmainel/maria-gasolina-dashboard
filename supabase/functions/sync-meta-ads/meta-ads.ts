export type MetaAction = {
  action_type: string;
  value: string;
};

export type MetaActionRow = {
  actions?: MetaAction[];
};

export function getActionValue(
  actions: MetaAction[] | undefined,
  actionType: string,
): number {
  const action = actions?.find((item) => item.action_type === actionType);
  return action ? Number(action.value) || 0 : 0;
}

export function summarizeActionTypes(rows: MetaActionRow[]) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    for (const action of row.actions ?? []) {
      totals.set(
        action.action_type,
        (totals.get(action.action_type) ?? 0) + (Number(action.value) || 0),
      );
    }
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([action_type, value]) => ({ action_type, value }));
}

export function getMetaAccountStatusLabel(status: number | undefined) {
  const labels: Record<number, string> = {
    1: "ACTIVE",
    2: "DISABLED",
    3: "UNSETTLED",
    7: "PENDING_RISK_REVIEW",
    8: "PENDING_SETTLEMENT",
    9: "IN_GRACE_PERIOD",
    100: "PENDING_CLOSURE",
    101: "CLOSED",
  };

  return status === undefined ? null : labels[status] ?? `UNKNOWN_${status}`;
}
