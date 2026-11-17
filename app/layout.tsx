
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./global.css";
import Navbar from "./components/Navbar";
const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Learnix",
  description: "A modern platform for focused learning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={outfit.className}>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
