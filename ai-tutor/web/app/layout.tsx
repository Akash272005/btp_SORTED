import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import LMSLayoutGate, {
  StudentRootRedirect,
} from "@/components/lms/LMSLayoutGate";
import { GlobalProvider } from "@/context/GlobalContext";
import ThemeScript from "@/components/ThemeScript";
import LayoutWrapper from "@/components/LayoutWrapper";
import { I18nClientBridge } from "@/i18n/I18nClientBridge";

// Use Inter font with swap display for better loading
const font = Inter({
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "AI Tutor",
  description: "Multi-Agent Teaching & Research Copilot",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={font.className}>
        <GlobalProvider>
          <I18nClientBridge>
            <LayoutWrapper>
              <StudentRootRedirect />
              <LMSLayoutGate mainSidebar={<Sidebar />}>{children}</LMSLayoutGate>
            </LayoutWrapper>
          </I18nClientBridge>
        </GlobalProvider>
      </body>
    </html>
  );
}
