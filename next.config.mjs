/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['better-sqlite3'],
    // The SQLite file is data, not code, so tracing never finds it. Without this the
    // serverless bundle ships without a database and every route 500s.
    outputFileTracingIncludes: {
      '/**/*': ['./data/apartments.db'],
    },
  },
};

export default nextConfig;
