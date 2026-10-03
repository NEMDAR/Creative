import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEMDAR Creator",
  description: "AI-assisted marketing media editor by NEMDAR",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
