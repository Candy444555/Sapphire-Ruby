// Flat-config ESLint setup used only by `pnpm run scan:static`.
// Kept separate from any project-wide config so the scanner doesn't get
// tangled in app build linting. ESLint v9+ defaults to flat config.
const security = require("eslint-plugin-security");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".expo/**",
      "android/**",
      "ios/**",
      "security-reports/**",
      "**/*.d.ts",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      "security/detect-object-injection": "off",
    },
  },
];
