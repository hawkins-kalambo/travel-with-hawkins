import type { Metadata } from "next";
import StructuredData from "./components/StructuredData";
import "./globals.css";

const siteUrl = "https://travelwithhawkins.com";
const siteName = "Travel With Hawkins";
const siteTitle = "Travel With Hawkins | Safe Student Transport in Malawi";
const siteDescription = "Book safe and reliable student transport in Mzuzu and across Malawi. Choose scheduled routes or request a custom trip with Travel With Hawkins.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s | Travel With Hawkins",
  },
  description: siteDescription,
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName,
    locale: "en_MW",
    type: "website",
    images: [
      {
        url: `${siteUrl}/hero.png`,
        width: 1672,
        height: 941,
        alt: "Students preparing to travel by coach with Travel With Hawkins in Mzuzu",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [`${siteUrl}/hero.png`],
  },
  icons: {
    icon: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
    shortcut: "/favicon.ico",
    apple: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteName,
  url: siteUrl,
  logo: `${siteUrl}/logo.png`,
  description: siteDescription,
  email: "travelwithhawkins@gmail.com",
  telephone: ["+265886470843", "+265989127308"],
  contactPoint: [
    {
      "@type": "ContactPoint",
      telephone: "+265886470843",
      contactType: "customer service",
      areaServed: "MW",
      availableLanguage: "English",
    },
    {
      "@type": "ContactPoint",
      telephone: "+265989127308",
      contactType: "customer service",
      areaServed: "MW",
      availableLanguage: "English",
      url: "https://wa.me/265989127308",
    },
  ],
  areaServed: {
    "@type": "Country",
    name: "Malawi",
  },
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
