import type { Metadata, Viewport } from "next";
import { Nunito, Rye } from "next/font/google";
import "./globals.css";

const body = Nunito({ variable: "--font-body", subsets: ["latin"] });
const display = Rye({ variable: "--font-display", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Kaanivaa 44 · Staff Roster",
  description: "Duty roster, attendance and lucky draw for Kaanivaa 44 staff volunteers.",
};

export const viewport: Viewport = { themeColor: "#e3262b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
