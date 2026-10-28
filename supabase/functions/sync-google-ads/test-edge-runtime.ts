// Test-only alias for @supabase/server. Production keeps its original secret
// authentication wrapper; this identity function lets tests call the handler.
export function withSupabase<T>(_options: unknown, handler: T): T {
  return handler;
}
