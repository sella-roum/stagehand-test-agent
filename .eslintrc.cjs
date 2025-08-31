module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    project: ["./tsconfig.json"],
  },
  // ESLintの検査対象から除外するファイル/ディレクトリを指定
  ignorePatterns: [
    ".eslintrc.cjs", // ESLint自身の設定ファイル
    "dist", // ビルド成果物
    "node_modules", // 依存関係
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};
