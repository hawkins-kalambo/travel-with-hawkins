import type { Metadata } from "next";
import StructuredData from "./components/StructuredData";
import "./globals.css";

const siteUrl = "https://travelwithhawkins.com";
const siteName = "Travel with Hawkins";
const siteDescription = "Book safe, reliable and affordable student transport across Malawi. Travel between Mzuzu, Lilongwe, Blantyre, Zomba and other destinations with Travel with Hawkins.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Travel with Hawkins | Safe Student Transport Across Malawi",
    template: "%s | Travel with Hawkins",
  },
  description: siteDescription,
  keywords: [
    "student transport Malawi",
    "Mzuzu University transport",
    "Malawi bus booking",
    "Mzuzu to Lilongwe transport",
    "student travel Malawi",
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: "Travel with Hawkins | Safe Student Transport Across Malawi",
    description: siteDescription,
    url: siteUrl,
    siteName,
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/hero.png",
        width: 1200,
        height: 630,
        alt: "Travel with Hawkins student transport booking",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Travel with Hawkins | Safe Student Transport Across Malawi",
    description: siteDescription,
    images: ["/hero.png"],
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
    shortcut: "/logo.png",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteName,
  url: siteUrl,
  description: siteDescription,
  email: "info@travelwithhawkins.com",
  sameAs: ["https://www.facebook.com/TravelWithHawkins"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <StructuredData data={organizationSchema} />
        {children}
      </body>
    </html>
  );
}
