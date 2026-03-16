const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Exclude server-only packages from the mobile bundle
config.resolver.blockList = [
  /server\/.*/,
  /server_dist\/.*/,
];

// These packages exist in dependencies for the server but must not be bundled
config.resolver.extraNodeModules = new Proxy({}, {
  get: (_, name) => {
    const serverOnlyPackages = [
      'express', 'pg', 'drizzle-orm', 'drizzle-zod',
      '@octokit/rest', 'http-proxy-middleware', 'ws',
      'drizzle-kit', 'esbuild',
    ];
    if (serverOnlyPackages.includes(String(name))) {
      return require.resolve('./lib/empty-module.js');
    }
    return require.resolve(String(name));
  }
});

module.exports = config;
