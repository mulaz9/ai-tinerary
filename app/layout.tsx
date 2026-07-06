import type { Metadata, Viewport } from "next";
import "../styles/globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import MobileNav from "../components/MobileNav";
import AuthRecoveryRedirect from "../components/AuthRecoveryRedirect";

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

  // Serwist is disabled in dev (next.config.ts), but a service worker
  // registered by a previous production build stays active on the device
  // and serves stale CSS/JS from its caches. Unregister it in dev so
  // devices always get fresh dev-server assets.
  const devSwCleanup = `
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        var n = rs.length;
        rs.forEach(function (r) { r.unregister(); });
        if (window.caches) {
          caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); });
        }
        /* #region agent log */
        if (n > 0) {
          fetch("/api/debug-89ffaa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "89ffaa",
              hypothesisId: "HC2",
              location: "layout.tsx:dev-sw-cleanup",
              message: "stale service worker unregistered in dev",
              data: { unregistered: n, ua: navigator.userAgent.slice(0, 120) },
              timestamp: Date.now(),
            }),
          }).catch(function () {});
        }
        /* #endregion */
      });
    }
  `;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className="bg-[#121212] text-white antialiased"
        suppressHydrationWarning
      >
        {process.env.NODE_ENV !== "production" ? (
          <script dangerouslySetInnerHTML={{ __html: devSwCleanup }} />
        ) : null}
        <NextIntlClientProvider>
          <AuthRecoveryRedirect />
          <MobileNav />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
