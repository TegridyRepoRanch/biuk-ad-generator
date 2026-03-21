import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ToastProvider } from "@/lib/toast"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "BIUK Ad Generator",
  description: "Create stunning social media ads in 7 steps with AI-powered tools",
}

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Serif+Display&family=Montserrat:wght@400;500;600;700;800;900&family=Oswald:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700;800;900&family=Raleway:wght@400;500;600;700;800;900&family=Roboto+Condensed:wght@400;500;700&display=swap"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
      </head>
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-zinc-100 antialiased`}>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
