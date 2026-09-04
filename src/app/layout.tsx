import type { Metadata } from "next";
import "./globals.css";
import "./intake.css";
import "./analysis.css";
export const metadata: Metadata = { title: { default: "ScopeFree", template: "%s · ScopeFree" }, description: "A clear record of your project scope and the changes you agree to.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
