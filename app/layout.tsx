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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://aura-athletic-erp.vercel.app"
  ),
  title: {
    default: "AURA Athletic Club | Member Portal & Access ERP",
    template: "%s | AURA Athletic Club",
  },
  description:
    "High-performance fitness management, digital QR gate pass, coaching rosters, and reception ERP for AURA Athletic Club.",
  keywords: [
    "gym erp",
    "fitness management",
    "qr gate pass",
    "aura athletic club",
    "workout attendance",
    "trainer portal",
  ],
  authors: [{ name: "AURA Athletic Club" }],
  openGraph: {
    title: "AURA Athletic Club | Member Portal & Access ERP",
    description:
      "High-performance fitness management, digital QR gate pass, coaching rosters, and reception ERP for AURA Athletic Club.",
    url: "/",
    siteName: "AURA Athletic Club",
    images: [
      {
        url: "/og-image.png",
        width: 1440,
        height: 900,
        alt: "AURA Athletic Club Portal Preview",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AURA Athletic Club | Member Portal & Access ERP",
    description:
      "High-performance fitness management, digital QR gate pass, coaching rosters, and reception ERP for AURA Athletic Club.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-touch-icon.png",
  },
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
