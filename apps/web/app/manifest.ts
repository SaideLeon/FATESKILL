import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FateSkill",
    short_name: "FateSkill",
    description: "Registo público e privado de Skills para IAs, com API e CLI.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08111f",
    theme_color: "#38bdf8",
    icons: [
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
