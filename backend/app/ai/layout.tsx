import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

/**
 * Segment layout for the AI pages: provides Clerk session context (useAuth / useUser)
 * without depending on what the root layout wraps. Harmless if the root layout
 * already has a ClerkProvider (Clerk supports a nested provider in a segment layout).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return <ClerkProvider dynamic>{children}</ClerkProvider>;
}
