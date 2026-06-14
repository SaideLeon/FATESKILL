import { TokenManager } from "@/components/token-manager";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getSupabaseServer } from "@/lib/supabase-server";

export default async function SettingsPage() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = getSupabaseAdmin();
  let username = "";
  let tokens: { id: string; name: string; scopes: string[]; created_at: string }[] = [];

  if (admin && user) {
    const { data: profile } = await admin.from("profiles").select("username").eq("id", user.id).single();
    username = profile?.username ?? "";
    const { data: tokenRows } = await admin
      .from("api_tokens")
      .select("id, name, scopes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    tokens = tokenRows ?? [];
  }

  return (
    <section className="container">
      <p className="eyebrow">Configurações</p>
      <h1>Conta e tokens</h1>
      <p>Email: {user?.email}</p>
      <p>Username: @{username || "—"}</p>
      <h2>Tokens de API</h2>
      <TokenManager initialTokens={tokens} />
    </section>
  );
}
