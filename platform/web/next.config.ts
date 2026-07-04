import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autocontido para o contêiner do Cloud Run (server.js mínimo).
  output: "standalone",
  async redirects() {
    return [
      // Domínio único: www é só alias — redireciona permanente para o apex.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.work4you.ai" }],
        destination: "https://work4you.ai/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
