import type { MetadataRoute } from "next";

const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/u/", "/api/", "/select", "/invite/", "/erinnerungen"],
    },
    sitemap: `${baseUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
