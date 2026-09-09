import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange } from "../types";

interface Props {
  range: DateRange;
  comparisonEnabled: boolean;
  onApply: (range: DateRange, comparisonEnabled: boolean) => void;
  onClose: () => void;
}

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toIso(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function makeRange(start: Date, end: Date): DateRange {
  return { start: toIso(start), end: toIso(end) };
}

export function PeriodPicker({ range, comparisonEnabled, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<DateRange>(range);
  const [compare, setCompare] = useState(comparisonEnabled);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseISO(range.end)));
  const [awaitingEnd, setAwaitingEnd] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null);

  const today = useMemo(() => new Date(), []);
  const presets = useMemo(() => {
    const lastWeek = subWeeks(today, 1);
    const lastMonth = subMonths(today, 1);

    return [
      { label: "Hoje", range: makeRange(today, today) },
      { label: "Ontem", range: makeRange(subDays(today, 1), subDays(today, 1)) },
      { label: "Últimos 7 dias", range: makeRange(subDays(today, 6), today) },
      { label: "Últimos 15 dias", range: makeRange(subDays(today, 14), today) },
      { label: "Últimos 30 dias", range: makeRange(subDays(today, 29), today) },
      { label: "Esta semana", range: makeRange(startOfWeek(today, { weekStartsOn: 0 }), today) },
      { label: "Semana passada", range: makeRange(startOfWeek(lastWeek, { weekStartsOn: 0 }), endOfWeek(lastWeek, { weekStartsOn: 0 })) },
      { label: "Este mês", range: makeRange(startOfMonth(today), today) },
      { label: "Mês passado", range: makeRange(startOfMonth(lastMonth), endOfMonth(lastMonth)) },
    ];
  }, [today]);

  const start = parseISO(draft.start);
  const end = parseISO(draft.end);
  const calendarDays = useMemo(() => {
    const first = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
    const last = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: first, end: last });
  }, [visibleMonth]);

  const comparisonRange = useMemo(() => {
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const previousEnd = subDays(start, 1);
    return makeRange(subDays(previousEnd, days - 1), previousEnd);
  }, [end, start]);

  const selectPreset = (nextRange: DateRange) => {
    setDraft(nextRange);
    setVisibleMonth(startOfMonth(parseISO(nextRange.end)));
    setAwaitingEnd(false);
    setHoveredDay(null);
  };

  const selectDay = (day: Date) => {
    const value = toIso(day);

    if (!awaitingEnd) {
      setDraft({ start: value, end: value });
      setAwaitingEnd(true);
      setHoveredDay(null);
      return;
    }

    const nextStart = isBefore(day, start) ? day : start;
    const nextEnd = isBefore(day, start) ? start : day;
    setDraft(makeRange(nextStart, nextEnd));
    setAwaitingEnd(false);
    setHoveredDay(null);
  };

  const updateDate = (field: keyof DateRange, value: string) => {
    if (!value) return;

    const next = { ...draft, [field]: value };
    if (field === "start" && next.start > next.end) next.end = next.start;
    if (field === "end" && next.end < next.start) next.start = next.end;
    setDraft(next);
    setVisibleMonth(startOfMonth(parseISO(value)));
    setAwaitingEnd(false);
    setHoveredDay(null);
  };

  const apply = () => {
    if (draft.start <= draft.end) onApply(draft, compare);
  };

  return (
    <div className="period-popover period-picker" role="dialog" aria-label="Escolher período">
      <div className="period-picker-head">
        <strong>Período de análise</strong>
        <button type="button" onClick={onClose} aria-label="Fechar filtro"><X size={19} /></button>
      </div>

      <div className="period-picker-body">
        <div className="period-presets" aria-label="Períodos pré-definidos">
          {presets.map((preset) => {
            const active = preset.range.start === draft.start && preset.range.end === draft.end;
            return (
              <button type="button" key={preset.label} className={active ? "active" : ""} onClick={() => selectPreset(preset.range)}>
                {active && <Check size={15} />}
                {preset.label}
              </button>
            );
          })}
          <span className="preset-divider" />
          <span className="preset-caption"><CalendarDays size={16} />Período personalizado</span>
        </div>

        <div className="period-calendar-panel">
          <div className="period-fields">
            <label>De<input type="date" value={draft.start} onChange={(event) => updateDate("start", event.target.value)} /></label>
            <label>Até<input type="date" value={draft.end} onChange={(event) => updateDate("end", event.target.value)} /></label>
          </div>

          <div className="calendar-heading">
            <button type="button" onClick={() => setVisibleMonth((month) => subMonths(month, 1))} aria-label="Mês anterior"><ChevronLeft size={19} /></button>
            <strong>{format(visibleMonth, "MMMM yyyy", { locale: ptBR })}</strong>
            <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, 1))} aria-label="Próximo mês"><ChevronRight size={19} /></button>
          </div>

          <p className="calendar-selection-help">{awaitingEnd ? "Agora selecione a data final." : "Seleciona a data inicial e depois a data final."}</p>

          <div className="calendar-grid weekdays">
            {weekdays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day) => {
              const previewStart = awaitingEnd && hoveredDay && isBefore(hoveredDay, start) ? hoveredDay : start;
              const previewEnd = awaitingEnd && hoveredDay
                ? (isBefore(hoveredDay, start) ? start : hoveredDay)
                : end;
              const selected = isSameDay(day, start) || (!awaitingEnd && isSameDay(day, end));
              const between = !awaitingEnd && !isBefore(day, start) && !isAfter(day, end);
              const preview = Boolean(awaitingEnd && hoveredDay && !isBefore(day, previewStart) && !isAfter(day, previewEnd));
              const muted = !isSameMonth(day, visibleMonth);

              return (
                <button
                  type="button"
                  key={toIso(day)}
                  data-date={toIso(day)}
                  aria-pressed={selected}
                  className={`${selected ? "selected" : ""} ${between ? "between" : ""} ${preview ? "preview" : ""} ${muted ? "muted" : ""}`}
                  onClick={() => selectDay(day)}
                  onMouseEnter={() => awaitingEnd && setHoveredDay(day)}
                  onMouseLeave={() => awaitingEnd && setHoveredDay(null)}
                  onFocus={() => awaitingEnd && setHoveredDay(day)}
                  onBlur={() => awaitingEnd && setHoveredDay(null)}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="period-picker-footer">
        <div className="period-comparison-info">
          <label className="comparison-toggle">
            <input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} />
            <span aria-hidden="true" />
            <strong>Comparar com período anterior</strong>
          </label>
          <p>{compare ? `Comparação: ${format(parseISO(comparisonRange.start), "dd MMM", { locale: ptBR })} a ${format(parseISO(comparisonRange.end), "dd MMM yyyy", { locale: ptBR })}` : "Comparação desativada"}</p>
        </div>
        <button type="button" className="primary-button" onClick={apply}>Aplicar período</button>
      </div>
    </div>
  );
}
