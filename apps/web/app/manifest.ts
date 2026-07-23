import { brandConfig } from "@lumen/config/brand";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f7f8fc",
    description: `${brandConfig.description} Pin selected decks to study safely without a connection.`,
    display: "standalone",
    icons: [
      {
        sizes: "192x192",
        src: "/pwa/icons/icon-192.png",
        type: "image/png",
      },
      {
        sizes: "512x512",
        src: "/pwa/icons/icon-512.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/pwa/icons/icon-maskable-512.png",
        type: "image/png",
      },
    ],
    id: "/app",
    name: brandConfig.name,
    orientation: "any",
    scope: "/",
    short_name: brandConfig.shortName.slice(0, 30),
    shortcuts: [
      {
        description: "Open your study hub",
        name: "Study",
        short_name: "Study",
        url: "/app/study",
      },
      {
        description: "Open your deck library",
        name: "Library",
        short_name: "Library",
        url: "/app",
      },
      {
        description: "Review offline storage and pending changes",
        name: "Offline & sync",
        short_name: "Sync",
        url: "/app/offline",
      },
    ],
    start_url: "/app?source=pwa",
    theme_color: "#5b4ce0",
  };
}
