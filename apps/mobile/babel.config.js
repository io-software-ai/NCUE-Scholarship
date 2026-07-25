module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind v4 + Expo SDK 57:
    // - `jsxImportSource: "nativewind"` routes JSX through NativeWind so `className` works.
    // - `nativewind/babel` MUST be a preset (it returns { plugins }), not a plugin.
    //   It also injects react-native-worklets/plugin, which babel-preset-expo
    //   auto-adds too; Babel dedupes the identical plugin path.
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
