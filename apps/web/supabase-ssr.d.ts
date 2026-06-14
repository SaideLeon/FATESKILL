declare module "@supabase/ssr" {
  import type { SupabaseClient } from "@supabase/supabase-js";

  type CookieToSet = {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  };

  type CookieMethods = {
    getAll(): { name: string; value: string }[];
    setAll?(cookiesToSet: CookieToSet[]): void;
  };

  export function createBrowserClient(url: string, key: string): SupabaseClient;
  export function createServerClient(url: string, key: string, options: { cookies: CookieMethods }): SupabaseClient;
}
