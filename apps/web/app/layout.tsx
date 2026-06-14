import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { LogoutButton } from "@/components/logout-button";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { getSupabaseServer } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "FateSkill",
  description: "Registo público e privado de Skills para IAs, com API e CLI.",
  applicationName: "FateSkill",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FateSkill"
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  }
};

export const viewport: Viewport = {
  themeColor: "#38bdf8"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="pt">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">FateSkill</Link>
          <nav>
            <Link href="/skills">Skills</Link>
            <Link href="/publish">Publicar</Link>
            <Link href="/dashboard">Dashboard</Link>
            {user ? (
              <>
                <Link href="/settings">{user.email}</Link>
                <LogoutButton />
              </>
            ) : (
              <Link href="/login">Entrar</Link>
            )}
          </nav>
        </header>
        <main>{children}</main>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
