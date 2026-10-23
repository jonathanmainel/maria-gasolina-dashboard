import { CLIENT_SLUG, isDemoMode } from "./api";
import { supabase } from "./supabase";
export type CommercialRole = "viewer" | "editor" | "admin" | null;
export interface CommercialAccess { role: CommercialRole; policyReady: boolean; canEdit: boolean; canManage: boolean; clientId: number | null; userId: string | null }
// Bloqueio de liberação. Só mudar após aprovação e verificação das políticas propostas.
export const COMMERCIAL_ACCESS_POLICY_READY = false;
export function resolveCommercialAccess(role: CommercialRole, policyReady: boolean, clientId: number | null = null, userId: string | null = null): CommercialAccess {
  return { role, policyReady, clientId, userId, canEdit: policyReady && (role === "editor" || role === "admin"), canManage: policyReady && role === "admin" };
}
export async function loadCommercialAccess(): Promise<CommercialAccess> {
  if (isDemoMode) return resolveCommercialAccess("editor", true);
  if (!supabase) return resolveCommercialAccess(null, false);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return resolveCommercialAccess(null, false);
  const { data: client, error: clientError } = await supabase.from("dashboard_clients").select("id").eq("slug", CLIENT_SLUG).maybeSingle();
  if (clientError) throw clientError;
  if (!client) return resolveCommercialAccess(null, false);
  const { data, error } = await supabase.from("dashboard_client_users").select("role").eq("client_id", client.id).eq("user_id", userData.user.id).maybeSingle();
  if (error) throw error;
  const role = ["viewer", "editor", "admin"].includes(data?.role) ? data!.role as CommercialRole : null;
  return resolveCommercialAccess(role, COMMERCIAL_ACCESS_POLICY_READY, client.id, userData.user.id);
}
