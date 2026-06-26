/** @type {import('next').NextConfig} */
const nextConfig = {
  // The gateway runs as a long-running Node server (not edge): it needs a
  // Postgres connection pool and a Redis client, neither of which survive in
  // an edge/serverless-per-request model.
  serverExternalPackages: ['pg', 'ioredis'],
};

export default nextConfig;
