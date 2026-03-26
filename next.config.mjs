/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Prisma istemcisinin webpack ile yanlış paketlenmesini önler;
    // aksi halde "does not match any query" gibi çalışma zamanı hataları görülebilir.
    serverComponentsExternalPackages: ["@prisma/client"]
  }
};

export default nextConfig;

