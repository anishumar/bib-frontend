import next from "eslint-config-next";

/*
 * eslint-config-next ships a flat-config ARRAY, not a factory — spread it.
 *
 * The design-system rules below are the part worth reading. They are the
 * cheapest guardrails that actually hold: each one bans a specific way of
 * going around the token layer, and each names the thing to use instead. They
 * are deliberately FEW — a linter cannot enforce taste, and a wall of rules
 * that people learn to silence is worse than none.
 */
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
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Type sizes come from the scale, never from a number somebody
          // picked. `.text-xs` / `.text-sm` / `.text-md` / `.text-lg` are the
          // four rungs; body needs no class at all.
          selector:
            'JSXAttribute[name.name="style"] ObjectExpression > Property[key.name=/^(fontSize|fontFamily|fontWeight|letterSpacing|lineHeight)$/]',
          message:
            "Type comes from the scale, not from an inline value. Use a text utility (.text-xs/.text-sm/.text-md/.text-lg) or a component that already sets it — see src/design/README.md.",
        },
        {
          // Colour is spent on status and nothing else, and every status has a
          // token. An inline colour cannot follow the theme.
          //
          // `var(--…)` is exempt: naming a token inline is the correct thing
          // to write when there is no component to carry it, and flagging it
          // would push people back to hexes to get the linter quiet.
          selector:
            'JSXAttribute[name.name="style"] ObjectExpression > Property[key.name=/^(color|background|backgroundColor|borderColor)$/][value.type="Literal"][value.value!=/^var\\(/]',
          message:
            "Colour comes from a token, or it will not follow the theme. Use .tone-danger/.tone-warn/.tone-ok, a <Pill>, or var(--…) from src/design/tokens.css.",
        },
        {
          // A hex in a component is a colour nobody else can reuse and dark
          // mode cannot reach.
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message:
            "No hardcoded colours in components. Add it to src/design/tokens.css if it is genuinely new — and it almost never is.",
        },
        {
          // The pre-design-system vocabulary. `legacy.css` is deleted; these
          // class names now style nothing at all.
          selector: 'JSXAttribute[name.name="className"] Literal[value=/\\bbib-/]',
          message:
            "The .bib-* classes are gone. Import the component from @/components/ui instead.",
        },
        {
          // Radii and shadows are two values and one value respectively. A
          // third of either is a decision nobody made on purpose.
          selector:
            'JSXAttribute[name.name="style"] ObjectExpression > Property[key.name=/^(borderRadius|boxShadow)$/]',
          message:
            "Radius and elevation are tokens (--r, --r-sm, --shadow). Use the component that carries them — <Card>, <Pill>, <Button>.",
        },
        {
          // F05 (audit 2026-10-03): React 19 resets a <form action={fn}> once
          // fn has run, refusal or not, so a refused form came back empty.
          selector: 'JSXOpeningElement[name.name="form"] > JSXAttribute[name.name="action"]',
          message:
            "A form the API can refuse must keep what was typed. Use onSubmit={(event) => keepTyped(event, fn)} from @/lib/ui/keep-typed.",
        },
      ],
    },
  },
];

export default config;
