import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type {
  NavigationConfig,
  NavigationConfigRaw,
  NavItem,
  NavItemRaw,
} from "@/types/navigation";
import { getAllChapterSlugs, getChapterInfo } from "@/lib/chapter-config";

const contentDirectory = path.join(process.cwd(), "content/pages");

export interface PageContent {
  slug: string;
  title: string;
  description: string;
  lastUpdated: string;
  content: string;
  headerImage?: string;
}

export interface PageMeta {
  slug: string;
  title: string;
  description: string;
  lastUpdated: string;
  headerImage?: string;
}

/**
 * Get a single page by slug
 */
export function getPage(slug: string): PageContent | null {
  try {
    const filePath = path.join(contentDirectory, `${slug}.md`);
    const fileContents = fs.readFileSync(filePath, "utf8");
    const { data, content } = matter(fileContents);

    return {
      slug,
      title: data.title || slug,
      description: data.description || "",
      lastUpdated: data.lastUpdated ? String(data.lastUpdated).split("T")[0] : "",
      content: content.trim(),
      headerImage: data.headerImage || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Get all pages (metadata only)
 */
export function getAllPages(): PageMeta[] {
  try {
    if (!fs.existsSync(contentDirectory)) {
      return [];
    }

    const files = fs.readdirSync(contentDirectory);
    const pages: PageMeta[] = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const slug = file.replace(/\.md$/, "");
      const filePath = path.join(contentDirectory, file);
      const fileContents = fs.readFileSync(filePath, "utf8");
      const { data } = matter(fileContents);

      pages.push({
        slug,
        title: data.title || slug,
        description: data.description || "",
        lastUpdated: data.lastUpdated ? String(data.lastUpdated).split("T")[0] : "",
        headerImage: data.headerImage || undefined,
      });
    }

    return pages.sort((a, b) => a.title.localeCompare(b.title));
  } catch {
    return [];
  }
}

/**
 * Get raw file content (for editing)
 */
export function getPageRaw(slug: string): string | null {
  try {
    const filePath = path.join(contentDirectory, `${slug}.md`);
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Navigation config
// ---------------------------------------------------------------------------

const navigationFile = path.join(process.cwd(), "content/navigation.json");

const chapters = getAllChapterSlugs()
  .map((slug) => ({ slug, name: getChapterInfo(slug)?.name ?? slug }))
  .sort((a, b) => a.name.localeCompare(b.name));

const FALLBACK_NAV: NavigationConfig = {
  items: [{ label: "Home", href: "/" }],
};

function getTemplateVariables(): Record<string, string> {
  const currentSeason =
    process.env.NEXT_PUBLIC_CURRENT_SEASON || "2026";
  const currentYear = new Date().getFullYear();
  const pbpYear = currentYear - ((currentYear - 3) % 4);
  const graniteAnvilYear = 2025;

  return {
    season: currentSeason,
    pbpYear: String(pbpYear),
    graniteAnvilYear: String(graniteAnvilYear),
  };
}

function resolveHref(
  href: string,
  variables: Record<string, string>,
): string {
  return href.replace(
    /\{\{([\w-]+)\}\}/g,
    (_, key) => variables[key] ?? `{{${key}}}`,
  );
}

function expandItem(
  item: NavItemRaw,
  variables: Record<string, string>,
): NavItem[] {
  if (item.separator) return [{ label: "", separator: true }];
  if (item.type === "heading") return [{ label: item.label ?? "", type: "heading" }];

  if (item.template === "chapters") {
    return chapters.map(({ slug, name }) => {
      const chapterVars = { ...variables, chapter: name, "chapter-slug": slug };
      return {
        label: name,
        href: resolveHref(item.href ?? "", chapterVars),
      };
    });
  }

  const resolved: NavItem = { label: item.label ?? "" };
  if (item.href) resolved.href = resolveHref(item.href, variables);
  if (item.external) resolved.external = true;
  if (item.style) resolved.style = item.style;
  if (item.children) {
    resolved.children = item.children.flatMap((child) =>
      expandItem(child, variables),
    );
  }

  return [resolved];
}

/**
 * Read raw navigation config (unexpanded, for admin editing)
 */
export function getNavigationRaw(): NavigationConfigRaw | null {
  try {
    if (!fs.existsSync(navigationFile)) return null;
    const raw = fs.readFileSync(navigationFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Read and resolve navigation config from content/navigation.json
 */
export function getNavigation(): NavigationConfig {
  try {
    if (!fs.existsSync(navigationFile)) return FALLBACK_NAV;

    const raw = fs.readFileSync(navigationFile, "utf8");
    const config: NavigationConfigRaw = JSON.parse(raw);
    const variables = getTemplateVariables();

    return {
      items: config.items.flatMap((item) => expandItem(item, variables)),
    };
  } catch {
    return FALLBACK_NAV;
  }
}
