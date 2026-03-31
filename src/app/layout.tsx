import type { Metadata } from "next";
import "./globals.css";
import { ensureRuntimeConfigValidated } from "@/lib/runtimeConfig";

export const metadata: Metadata = {
  title: "Maprithm Ticaret AI",
  description: "Yapay zeka destekli e-ticaret yönetim paneli"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  ensureRuntimeConfigValidated();
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

