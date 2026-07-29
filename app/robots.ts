import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/admin/",
          "/ambassador/",
          "/api/",
          "/auth/",
          "/communication/",
          "/customer/",
          "/login",
          "/reset-password",
          "/update-password",
        ],
      },
    ],
    sitemap: "https://travelwithhawkins.com/sitemap.xml",
    host: "https://travelwithhawkins.com",
  };
}
