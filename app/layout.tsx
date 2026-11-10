import type { Metadata } from "next";
import { Geist, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// Body font: clean geometric sans. Display font: condensed athletic grotesk.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AURA Athletic Club | Member Portal",
  description: "Elite performance & fitness dashboard for AURA Athletic Club",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geist.variable} ${barlowCondensed.variable}`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
