const path = require('path');
const { getDefaultConfig } = require('metro-config');

module.exports = (async () => {
  const defaultConfig = await getDefaultConfig();
  const root = path.resolve(__dirname, '..');

  return {
    ...defaultConfig,
    projectRoot: __dirname,
    watchFolders: [root],
    transformer: {
      ...(defaultConfig.transformer || {}),
      assetRegistryPath: 'react-native/Libraries/Image/AssetRegistry',
    },
    resolver: {
      ...defaultConfig.resolver,
      sourceExts: [...(defaultConfig.resolver?.sourceExts || []), 'ts', 'tsx', 'cjs', 'mjs'],
      nodeModulesPaths: [
        path.resolve(__dirname, 'node_modules'),
        path.resolve(root, 'node_modules'),
      ],
    },
  };
})();
