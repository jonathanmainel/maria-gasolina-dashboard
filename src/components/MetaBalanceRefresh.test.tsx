// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ load: vi.fn(), request: vi.fn() }));
vi.mock("../lib/meta-balance", async importOriginal => ({ ...(await importOriginal<typeof import("../lib/meta-balance")>()),
  loadMetaBalanceStatus: fake.load, requestMetaBalance: fake.request }));
import { MetaBalanceRefresh } from "./MetaBalanceRefresh";
import { MetaBalanceRequestError } from "../lib/meta-balance";
let client: QueryClient;
const mount = (canEdit = true, onRefresh = vi.fn().mockResolvedValue(null), ids = ["123"]) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MetaBalanceRefresh userId="verified" canEdit={canEdit} accountIds={ids} onRefresh={onRefresh} /></QueryClientProvider>);
  return onRefresh;
};
const availability = (patch = {}) => ({ available: true, can_request: true, reason: null, server_time: "2026-11-18T18:00:00Z",
  accounts: [{ account_id: "123", status: null, allowed: true }], ...patch });
beforeEach(() => { fake.load.mockReset().mockResolvedValue(availability()); fake.request.mockReset().mockResolvedValue({ state: "success" }); });
afterEach(() => { cleanup(); client.clear(); });
describe("Meta finance refresh", () => {
  it("keeps routine text and account IDs out of the compact control", async () => {
    mount(); await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
    expect(screen.queryByText(/123|Nenhuma coleta|independente da sincronização/)).toBeNull();
    expect(screen.getByRole('button')).toHaveTextContent('Atualizar saldo');
  });
  it("selects the requested active account without exposing IDs in the main control", async () => {
    fake.load.mockResolvedValue(availability({ accounts: [{ account_id: '123', allowed: true }, { account_id: '456', allowed: true }] }));
    mount(true, vi.fn().mockResolvedValue(null), ['123', '456']);
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
    fireEvent.change(screen.getByRole('combobox', { name: 'Conta Meta para atualizar' }), { target: { value: '456' } });
    fireEvent.click(screen.getByRole('button')); await screen.findByText('Nova medição confirmada e registrada.');
    expect(fake.request).toHaveBeenCalledWith('456', expect.any(String), 'verified');
  });
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
    mount(false); await waitFor(() => expect(fake.load).toHaveBeenCalled());
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
    fake.load.mockResolvedValue(availability({ accounts: [{ account_id: "123", status: "indeterminate", overdue: false, allowed: true }] })); mount();
    await screen.findByText(/Coleta sem confirmação/);
    expect(screen.getByRole("button")).toBeDisabled();
  });
  it("uses a new execution key after a definitive failure, preserving uncertain retries separately", async () => {
    fake.request.mockRejectedValue(new MetaBalanceRequestError("Falha confirmada.", true)); mount();
    const button = await screen.findByRole("button", { name: "Atualizar saldo Meta agora" });
    await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
    await screen.findByText("Falha confirmada."); await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
    await waitFor(() => expect(fake.request).toHaveBeenCalledTimes(2));
    expect(fake.request.mock.calls[0][1]).not.toBe(fake.request.mock.calls[1][1]);
  });
  it("keeps an editor's button disabled while backend homologation is off", async () => {
    fake.load.mockResolvedValue(availability({ available: false, can_request: false })); mount();
    await screen.findByText(/Coleta automática em homologação/); expect(screen.getByRole("button")).toBeDisabled();
    expect(fake.request).not.toHaveBeenCalled();
  });
  it("respects backend cooldown and a same-day manual record for both manual and hourly collection", async () => {
    fake.load.mockResolvedValue(availability({ accounts: [{ account_id: "123", status: "success", allowed: true,
      retry_at: "2026-11-18T18:05:00Z", manual_blocked_today: true }] })); mount();
    await screen.findByText(/atualização automática e pelo botão bloqueadas/); expect(screen.getByRole("button")).toBeDisabled();
  });
});
