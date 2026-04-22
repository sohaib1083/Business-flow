/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '50mb' },
    serverComponentsExternalPackages: ['duckdb', 'firebase-admin'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push('duckdb')
    }
    return config
  },
}

module.exports = nextConfig
