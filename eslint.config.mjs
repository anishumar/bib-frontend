import next from "eslint-config-next";

// eslint-config-next ships a flat-config ARRAY, not a factory — spread it.
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      // Generated from the API's OpenAPI spec and overwritten by
      // `npm run api:generate`. Linting it would be linting the backend.
      "src/lib/api/schema.d.ts",
    ],
  },
  ...next,
];

export default config;
