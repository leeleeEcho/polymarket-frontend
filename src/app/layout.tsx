import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import dynamic from "next/dynamic";

// Dynamically import Providers to avoid SSR issues with localStorage
const Providers = dynamic(() => import("./providers").then((mod) => mod.Providers), {
  ssr: false,
});

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0ea5e9",
};

export const metadata: Metadata = {
  title: "nextX - Predict What's Next",
  description: "Decentralized prediction market platform. Trade on the outcome of real-world events.",
  keywords: ["prediction market", "crypto", "trading", "DeFi", "Web3", "nextX"],
  authors: [{ name: "nextX Team" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "nextX",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "nextX - Predict What's Next",
    description: "Decentralized prediction market platform. Trade on the outcome of real-world events.",
    type: "website",
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary",
    title: "nextX - Predict What's Next",
    description: "Decentralized prediction market platform.",
    images: ["/logo.png"],
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body className={`${inter.className} bg-gray-900 text-white min-h-screen antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
