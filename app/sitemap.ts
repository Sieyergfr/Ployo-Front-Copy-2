import type { MetadataRoute } from "next";

const baseUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${baseUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/register`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/datenschutz`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/impressum`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/agb`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
