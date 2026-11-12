import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "WcCAT | What Chinese Care About Today",
  description:
    "A daily attention radar for the Chinese internet: attention, emotion, conflict, interest, and consensus."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
