import "../styles/globals.css";
import MobileNav from "../components/MobileNav";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>AI-tinerary</title>
      </head>
      <body className="bg-[#121212] text-white antialiased">
        {/* Mobile top bar + bottom nav (hidden on lg+) */}
        <MobileNav />
        {children}
      </body>
    </html>
  );
}
