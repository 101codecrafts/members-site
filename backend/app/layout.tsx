import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

/**
 * Root layout for the few App Router pages the backend serves (/ai, /assistant,
 * /whiteboard). The marketing site is static (public/*.html via rewrites) and
 * /api/* are route handlers, so this stays minimal; Clerk is provided per
 * segment layout.
 */
export const metadata: Metadata = {
  title: { default: "101 Codecrafts", template: "%s · 101 Codecrafts" },
  description: "101 Codecrafts members site",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
