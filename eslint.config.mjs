import globals from "globals";
import tsEslintParser from "@typescript-eslint/parser";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["dist/", "node_modules/", "src-tauri/target/"],
  },
  {
    files: ["**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsEslintParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-empty": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "off",
      "no-useless-expressions": "off",
      "prefer-const": "off",
      "no-undef": "off",
      "no-console": "off",
      "no-control-regex": "off",
      "no-unsafe-finally": "off",
      "no-irregular-whitespace": "off",
      "preserve-caught-error": "off",
      "no-empty-pattern": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-useless-template-literals": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-useless-assignment": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "react/display-name": "off",
    },
    plugins: {
      "@typescript-eslint": tsEslintPlugin,
    },
  },
];
