import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "tmp", "prisma/migrations"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx,js}"],
    // Los tests antiguos llevan comentarios de desactivación con nombres de reglas ya renombrados.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // Los usos heredados de `any` se muestran como aviso y el CI (npm run lint:ci) falla si aparece
      // uno más: el número solo puede bajar. Ver docs/CALIDAD.md.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  {
    // Los tests cargan el módulo con require() DESPUÉS de jest.mock(): es deliberado.
    files: ["__tests__/**", "jest.setup.js", "jest.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // La referencia triple-barra carga los tipos de Express que amplía types/express.d.ts.
    files: ["src/server.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": "off" },
  }
);
