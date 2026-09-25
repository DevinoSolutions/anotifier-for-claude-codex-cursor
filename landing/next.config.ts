import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // The site's CSS is a few KB: inlining it as <style> saves the two
  // render-blocking stylesheet round trips before first paint on mobile.
  experimental: { inlineCss: true },
};

export default nextConfig;
