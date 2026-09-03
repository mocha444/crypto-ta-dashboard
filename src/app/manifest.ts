import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crypto TA Dashboard",
    short_name: "CryptoTA",
    description: "Live CoinGecko data + Groq AI summaries with RSI, MACD, Bollinger Bands",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#f59e0b",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [],
    categories: ["finance", "utilities"],
  };
}
