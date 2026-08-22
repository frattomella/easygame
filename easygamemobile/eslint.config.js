// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    // .codex-* sono artefatti locali di tooling, gitignored: non fanno parte
    // del progetto e non devono far fallire il lint (ne in locale ne in CI).
    ignores: ["dist/*", ".codex-*", "server_dist/*"],
  },
]);
