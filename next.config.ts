import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.178.50"],
  devIndicators: {
    position: "top-right",
  },
};

export default nextConfig;
