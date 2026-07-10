import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "zRiemannian — zeta-riemannian-agent v1.0",
  description:
    "Autonomous mathematical research agent focused on the Riemann Hypothesis. Built on the Artificial Junky Neuron (AJN) framework inherited from predator-jungle-agent.",
  keywords: [
    "Riemann Hypothesis",
    "zeta function",
    "autonomous agent",
    "AJN",
    "predator-jungle-agent",
    "quantum-spherifier",
    "LaTeX",
    "scientific publishing",
    "GLM-4.6",
    "Z.ai",
  ],
  authors: [{ name: "zeta-riemannian-agent — lineage: predator-jungle-agent by Justo Tapiador Garcia (UA)" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
