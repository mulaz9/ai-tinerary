import '../styles/globals.css';

export default function TripLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Travel Itinerary</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
