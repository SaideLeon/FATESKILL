import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillHub",
  description: "Registo público e privado de Skills para IAs, com API e CLI."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">SkillHub</Link>
          <nav>
            <Link href="/skills">Skills</Link>
            <Link href="/publish">Publicar</Link>
            <Link href="/dashboard">Dashboard</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
