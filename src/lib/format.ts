import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const money = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export const compact = (value: number | null | undefined) =>
  value == null ? "—" : new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const integer = (value: number | null | undefined) =>
  value == null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);

export const percent = (value: number | null | undefined) =>
  value == null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;

export const shortDate = (value: string) => format(parseISO(value), "dd/MM", { locale: ptBR });
export const longDate = (value: string) => format(parseISO(value), "dd 'de' MMMM", { locale: ptBR });

export const dateTime = (value?: string) => {
  if (!value) return "Ainda não sincronizado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
};

export const delta = (current: number | null | undefined, previous: number | null | undefined) => {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};
