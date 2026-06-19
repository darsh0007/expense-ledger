import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Expense Ledger",
  description: "Personal expense ledger & social debt tracker",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Ledger", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
