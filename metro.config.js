const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add epub and svg to asset extensions so Metro can bundle them natively
config.resolver.assetExts.push('epub');
config.resolver.assetExts.push('svg');

module.exports = config;
