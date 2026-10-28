// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCallback, useRef, useState } from "react";
import { Popover } from "./popover";

function Example({ empty = false }: { empty?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <><button ref={anchor} onClick={() => setOpen(true)}>Abrir</button><button>Fundo</button>
    <Popover open={open} onClose={close} anchorRef={anchor} label="Teste">
      {!empty && <><button>Primeiro</button><button disabled>Desabilitado</button><button hidden>Oculto</button><input aria-label="Campo" /><button>Último</button></>}
    </Popover></>;
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function(this: HTMLElement) {
    return (this.hidden ? [] : [new DOMRect(0, 0, 50, 30)]) as unknown as DOMRectList;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("moves focus into the dialog, cycles both ways and restores the trigger on Escape", () => {
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Abrir" }); trigger.focus(); fireEvent.click(trigger);
  const first = screen.getByRole("button", { name: "Primeiro" }); const last = screen.getByRole("button", { name: "Último" });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: "Tab" }); expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
});
it("makes background inert and restores its previous inert/scroll state on cleanup", () => {
  const prior = document.createElement("div"); prior.inert = true; document.body.append(prior);
  const { container, unmount } = render(<Example />);
  document.body.style.overflow = "auto"; fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  expect(container.inert).toBe(true); expect(document.body.style.overflow).toBe("hidden");
  unmount(); expect(container.inert).toBe(false); expect(prior.inert).toBe(true); expect(document.body.style.overflow).toBe("auto");
  prior.remove(); document.body.style.overflow = "";
});
it("contains programmatic focus and handles a dialog with no interactive children", () => {
  render(<Example empty />); fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  const panel = screen.getByRole("dialog"); expect(document.activeElement).toBe(panel);
  fireEvent.keyDown(panel, { key: "Tab" }); expect(document.activeElement).toBe(panel);
  screen.getByText("Fundo").focus(); expect(document.activeElement).toBe(panel);
});
it("closes on backdrop and returns focus without changing background controls", () => {
  const { container } = render(<Example />); const trigger = screen.getByRole("button", { name: "Abrir" });
  fireEvent.click(trigger); fireEvent.mouseDown(document.querySelector(".overlay-backdrop")!);
  expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger); expect(container.inert).toBe(false);
});
