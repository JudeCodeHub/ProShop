import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AuthProvider } from "@/lib/auth-context";
import { readSession } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "ProShop POS",
    template: "%s · ProShop POS",
  },
  description: "Point-of-sale system for a sports shop.",
};

export default async function RootLayout({ children }) {
  const session = readSession(await cookies());

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900">
        <AuthProvider initialUser={session?.user ?? null}>{children}</AuthProvider>
      </body>
    </html>
  );
}
