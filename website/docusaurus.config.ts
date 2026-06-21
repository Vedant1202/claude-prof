import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: "cprof",
  tagline: "Snapshot, scrub, and migrate your Claude Code setup.",
  favicon: "img/favicon.ico",

  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // GitHub Pages project site: https://Vedant1202.github.io/claude-prof/
  url: "https://Vedant1202.github.io",
  baseUrl: "/claude-prof/",
  organizationName: "Vedant1202",
  projectName: "claude-prof",
  trailingSlash: false,

  onBrokenLinks: "throw",

  // Parse plain `.md` as CommonMark (not MDX) so prose with ${env:NAME}, <file>,
  // and generics renders literally; `.mdx` files still get full MDX.
  markdown: {
    format: "detect",
    hooks: {
      // v4 location for the broken-markdown-link policy (future.v4 is on).
      onBrokenMarkdownLinks: "throw",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/Vedant1202/claude-prof/tree/main/website/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/docusaurus-social-card.jpg",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "cprof",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          href: "https://github.com/Vedant1202/claude-prof",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [{ label: "Getting Started", to: "/docs/getting-started" }],
        },
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/Vedant1202/claude-prof",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} cprof. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
