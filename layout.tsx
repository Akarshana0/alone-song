// frontend/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#000000",
};

export const metadata: Metadata = {
  title: "ALONE Audio Studio",
  description: "AI-Powered Professional Web DAW — Vocal Removal, Multi-Track Mixing, Real-Time FX",
  keywords: ["audio editor", "vocal remover", "DAW", "music production", "AI audio"],
  authors: [{ name: "ALONE Audio Studio" }],
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "ALONE Audio Studio",
    description: "AI-Powered Professional Web DAW",
    type: "website",
    images: [{ url: "/icon.png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@100;200;300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-black text-white antialiased min-h-screen">
        {/* Cyberpunk scan-line overlay */}
        <div className="fixed inset-0 pointer-events-none z-50 scanlines" />
        {/* Ambient glow */}
        <div
          className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px]
          bg-cyan-500/5 blur-[120px] pointer-events-none z-0 rounded-full"
        />
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
