import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "nefes. | Hava Kalitesi Panosu",
  description: "Manisa, Soma, Aliağa ve İzmir Konak için saatlik hava kalitesi tahminlerini karşılaştırın ve daha uygun zaman aralıklarını keşfedin.",
  applicationName: "nefes. Hava Kalitesi"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
