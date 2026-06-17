import type { CapacitorConfig } from "@capacitor/cli";

const PRODUCTION_URL =
  process.env.CAPACITOR_SERVER_URL ??
  "https://ai-tinerary-nine.vercel.app";

const config: CapacitorConfig = {
  appId: "com.aitinerary.app",
  appName: "AI-tinerary",
  webDir: "dist",
  server: {
    url: PRODUCTION_URL,
    cleartext: false,
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#121212",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#121212",
    },
  },
};

export default config;
