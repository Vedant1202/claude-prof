import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

// Curated adopter IA. Doc IDs are file paths under docs/ without the extension.
const sidebars: SidebarsConfig = {
  docsSidebar: [
    "getting-started",
    {
      type: "category",
      label: "Concepts",
      items: ["concepts/profiles", "concepts/local-first"],
    },
    "redaction",
    {
      type: "category",
      label: "Guides",
      items: [
        "guides/migrate",
        "guides/scaffold",
        "guides/rollback",
        "guides/drift",
        "guides/output-locations",
        "guides/scanning",
      ],
    },
    {
      type: "category",
      label: "Reference",
      items: ["reference/commands", "reference/cprofignore"],
    },
  ],
};

export default sidebars;
