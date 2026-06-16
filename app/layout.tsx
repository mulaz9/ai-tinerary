import "../styles/globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import MobileNav from "../components/MobileNav";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    // `suppressHydrationWarning` ignores attribute-only mismatches injected by
    // browser extensions (Grammarly, ColorZilla, Dark Reader, password
    // managers…) on <html>/<body>. It only suppresses the warning for these two
    // elements' own attributes — real mismatches deeper in the tree still warn.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <title>AI-tinerary</title>
      </head>
      <body
        className="bg-[#121212] text-white antialiased"
        suppressHydrationWarning
      >
        <NextIntlClientProvider>
          {/* Mobile top bar + bottom nav (hidden on lg+) */}
          <MobileNav />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
