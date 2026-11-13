import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Diperlukan untuk direktif "use cache" (ISR katalog & detail kuis, F10).
  cacheComponents: true,
};

export default nextConfig;
