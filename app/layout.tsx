// Made By Eng Nayer Nader
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.thecloungeworld.com"),
  title: "The C Lounge | Private Global Office",
  description:
    "One accountable private office coordinating aviation, mobility, accommodation, lifestyle, marine, access and security worldwide.",
  icons: {
    icon: "/images/logo-c.png",
    shortcut: "/images/logo-c.png",
  },
  openGraph: {
    title: "The C Lounge | Private Global Office",
    description:
      "Ten disciplines. One point of contact. A private global office for seamless movement and access.",
    images: ["/images/hero.jpg"],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
