import { commercialCategories, commercialFronts, frontsForCategory } from "../lib/fronts";
import type { CommercialFront } from "../types";
import { Segmented } from "./ui/primitives";

export function CommercialFrontSelector({ front, onChange, id = "sales-front" }: { front: CommercialFront; onChange: (next: CommercialFront) => void; id?: string }) {
  const category = commercialFronts[front].category;
  const choices = frontsForCategory(category);
  return <div className="commercial-selection">
    <Segmented value={category} onChange={next => { const first = frontsForCategory(next)[0]; if (first) onChange(first.id); }} options={commercialCategories.map(item => ({ id: item.id, label: item.label }))} />
    {choices.length > 1 && <label className="sales-front-select" htmlFor={id}>Frente comercial<select id={id} value={front} onChange={event => { const next = choices.find(item => item.id === event.target.value); if (next) onChange(next.id); }}>{choices.map(item => <option key={item.id} value={item.id}>{item.short}</option>)}</select></label>}
  </div>;
}
