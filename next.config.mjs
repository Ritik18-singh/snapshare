/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sharp"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
