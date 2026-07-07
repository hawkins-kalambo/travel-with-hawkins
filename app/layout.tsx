import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel with Hawkins - Student Transport Booking",
  description: "Safe, reliable, and smart student transport system for Mzuzu University. Book verified routes or custom destinations across Malawi.",
  // ✅ Uses your /public/logo.png as favicon on all devices
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
    shortcut: "/logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
