import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // These Node parsers load companion workers/assets relative to their installed modules.
  // Preserve those paths inside the production extraction worker as well as in development.
  serverExternalPackages: ["pdfjs-dist", "mammoth", "yauzl"],
  outputFileTracingIncludes: {
    "/api/projects/*/baseline/extract": ["./scripts/extract-document.mjs", "./node_modules/mammoth/**/*", "./node_modules/yauzl/**/*", "./node_modules/pdfjs-dist/legacy/build/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};
export default config;
