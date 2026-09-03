/*
 * PostCSS, added ONLY to run Tailwind v4.
 *
 * Note what this file costs: Next applies a default PostCSS pipeline when no
 * config is present, and the moment one exists that default is REPLACED, not
 * extended. So this file is deliberately minimal, and the migration commit
 * that added it diffed the emitted stylesheet byte for byte to prove nothing
 * was silently dropped.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
