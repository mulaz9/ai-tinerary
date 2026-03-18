export default function TripLayout({ children }: { children: React.ReactNode }) {
  // No extra wrapper — the page already handles its own bg / padding.
  return <>{children}</>;
}
