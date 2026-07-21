import localFont from "next/font/local";

export const productSans = localFont({
  display: "optional",
  fallback: ["system-ui", "sans-serif"],
  preload: false,
  src: "../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  variable: "--font-manrope",
  weight: "200 800",
});
