import {
  createLightTheme,
  createDarkTheme,
  type BrandVariants,
  type Theme,
} from "@fluentui/react-components";

// ─── Brand ramp: "Iris" ─────────────────────────────────────────────────────
// The workhorse interactive colour (buttons, active nav, links). Amber is kept
// separate as the single "signal" accent — see ACCENTS below.
const iris: BrandVariants = {
  10: "#050418",
  20: "#171630",
  30: "#24224C",
  40: "#2E2B63",
  50: "#39357B",
  60: "#443F94",
  70: "#504AAD",
  80: "#5D56C6",
  90: "#6E62E5",
  100: "#7E74EA",
  110: "#8F86EE",
  120: "#A098F1",
  130: "#B2ABF5",
  140: "#C4BEF8",
  150: "#D6D2FB",
  160: "#E9E6FD",
};

/** Mission-Control signal colours used sparingly for attention / status. */
export const ACCENTS = {
  amber: "#FFB020",
  amberSoft: "#FFC65C",
  mint: "#3DDC97",
  iris: "#6E62E5",
  danger: "#FF5C6C",
} as const;

/** Console surface ramp for the dark theme (near-ink, slightly blue). */
export const INK = {
  bg0: "#0B0D13",
  bg1: "#0E1017",
  bg2: "#131620",
  bg3: "#191D28",
  stroke: "#242A38",
  strokeSoft: "#1C212C",
} as const;

export const FONTS = {
  base: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  display: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Cascadia Code', ui-monospace, monospace",
} as const;

function withFonts(theme: Theme): Theme {
  theme.fontFamilyBase = FONTS.base;
  theme.fontFamilyMonospace = FONTS.mono;
  theme.fontFamilyNumeric = FONTS.base;
  return theme;
}

export const lightTheme: Theme = withFonts(createLightTheme(iris));

export const darkTheme: Theme = (() => {
  const t = withFonts(createDarkTheme(iris));
  // Push Fluent's default dark grays toward the Mission-Control ink palette.
  t.colorNeutralBackground1 = INK.bg1;
  t.colorNeutralBackground1Hover = "#1A1F2B";
  t.colorNeutralBackground1Selected = "#1A1F2B";
  t.colorNeutralBackground2 = INK.bg2;
  t.colorNeutralBackground2Hover = "#1A1F2B";
  t.colorNeutralBackground3 = INK.bg3;
  t.colorNeutralBackground3Hover = "#1E2330";
  t.colorNeutralBackground4 = INK.bg0;
  t.colorNeutralStroke1 = INK.stroke;
  t.colorNeutralStroke2 = INK.strokeSoft;
  t.colorNeutralStroke3 = INK.strokeSoft;
  // Slightly brighter brand foreground so iris pops on ink.
  t.colorBrandForeground1 = "#8F86EE";
  t.colorBrandForeground2 = "#A098F1";
  return t;
})();
