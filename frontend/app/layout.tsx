import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BusinessFlow — Ask your data anything",
  description:
    "A query-driven, self-learning natural-language analytics layer over your database.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
