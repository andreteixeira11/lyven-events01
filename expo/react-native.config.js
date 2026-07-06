/**
 * React Native CLI config.
 *
 * `react-native-maps` and `@teovilla/react-native-web-maps` are pulled in
 * transitively by `@rork-ai/toolkit-sdk`, but they are only used for the
 * WEB maps polyfill (toolkit-sdk/lib/module/polyfills/maps.web.js).
 *
 * On native iOS, react-native-maps@1.27.1 ships Fabric/New-Architecture
 * codegen code that does not compile with `newArchEnabled: false`, breaking
 * the App Store build. Neither package is imported anywhere in the app's
 * native code, so we exclude them from native autolinking (CocoaPods).
 * Metro still resolves them for the web bundle.
 */
module.exports = {
  dependencies: {
    'react-native-maps': {
      platforms: {
        ios: null,
        android: null,
      },
    },
    '@teovilla/react-native-web-maps': {
      platforms: {
        ios: null,
        android: null,
      },
    },
  },
};
