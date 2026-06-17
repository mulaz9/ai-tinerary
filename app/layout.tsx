import type { Metadata, Viewport } from "next";
import "../styles/globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import MobileNav from "../components/MobileNav";

const APP_NAME = "AI-tinerary";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Pianifica itinerari di viaggio con l'AI, mappe interattive e meteo.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#121212",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className="bg-[#121212] text-white antialiased"
        suppressHydrationWarning
      >
        <NextIntlClientProvider>
          <MobileNav />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
