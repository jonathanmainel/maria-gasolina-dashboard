// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ load: vi.fn(), request: vi.fn() }));
vi.mock("../lib/meta-balance", async importOriginal => ({ ...(await importOriginal<typeof import("../lib/meta-balance")>()),
  loadMetaBalanceStatus: fake.load, requestMetaBalance: fake.request }));
import { MetaBalanceRefresh } from "./MetaBalanceRefresh";
let client: QueryClient;
const mount = (canEdit = true, onRefresh = vi.fn().mockResolvedValue(null)) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MetaBalanceRefresh userId="verified" canEdit={canEdit} accountIds={["123"]} onRefresh={onRefresh} /></QueryClientProvider>);
  return onRefresh;
};
beforeEach(() => { fake.load.mockReset().mockResolvedValue([]); fake.request.mockReset().mockResolvedValue({ state: "success" }); });
afterEach(() => { cleanup(); client.clear(); });
describe("Meta finance refresh", () => {
  it("requests backend and refreshes cards/history only after completion", async () => {
    let done!: (value: unknown) => void;
    fake.request.mockImplementation(() => new Promise(resolve => { done = resolve; }));
    const refresh = mount();
    const button = await screen.findByRole("button", { name: "Atualizar saldo Meta agora" });
    await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button); fireEvent.click(button);
    expect(fake.request).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText("Nova medição confirmada e registrada.")).toBeNull();
    done({ state: "success" });
    expect(await screen.findByText("Nova medição confirmada e registrada.")).toBeVisible();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
  it("viewer reads status without a write control", async () => {
    mount(false); await screen.findByText(/Nenhuma coleta/);
    expect(screen.queryByRole("button")).toBeNull(); expect(fake.request).not.toHaveBeenCalled();
  });
  it("preserves the request key after network uncertainty, with no false success", async () => {
    fake.request.mockRejectedValue(new Error("Coleta não confirmada.")); mount();
    const button = await screen.findByRole("button", { name: "Atualizar saldo Meta agora" });
    await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
    await screen.findByText("Coleta não confirmada."); await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
    await waitFor(() => expect(fake.request).toHaveBeenCalledTimes(2));
    expect(fake.request.mock.calls[0][1]).toBe(fake.request.mock.calls[1][1]);
    expect(screen.queryByText("Nova medição confirmada e registrada.")).toBeNull();
  });
  it("blocks a second request when a worker needs verification", async () => {
    fake.load.mockResolvedValue([{ account_id: "123", status: "indeterminate", overdue: false }]); mount();
    await screen.findByText(/Coleta sem confirmação/);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
