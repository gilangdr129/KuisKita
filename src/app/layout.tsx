import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { TokenFragmentHandler } from "@/components/auth/token-fragment-handler";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "KuisKita",
    template: "%s · KuisKita",
  },
  description:
    "Buat, kerjakan, dan bersaing di papan peringkat kuis berbahasa Indonesia. Cepat di HP, adil, dan mudah dipakai guru maupun kreator.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="min-h-dvh bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-50">
        <ThemeProvider>
          <ToastProvider>
            <TokenFragmentHandler />
            <Header />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
