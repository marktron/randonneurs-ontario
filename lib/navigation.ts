/**
 * Client-safe navigation resolution module.
 *
 * Imports content/navigation.json as a JSON module (resolved at build time)
 * so it works in both server and client component bundles -- no `fs` needed.
 *
 * The template-expansion helpers (expandItem, resolveHref, getTemplateVariables)
 * live here and are re-exported so lib/content.ts can reuse them for the
 * server-side getNavigation() without duplicating logic.
 */

import navigationJson from "@/content/navigation.json";
import type {
  NavigationConfig,
  NavigationConfigRaw,
  NavItem,
  NavItemRaw,
} from "@/types/navigation";
import { getAllChapterSlugs, getChapterInfo } from "@/lib/chapter-config";

// ---------------------------------------------------------------------------
// Chapter list (sorted by name, computed once at module load)
// ---------------------------------------------------------------------------

const chapters = getAllChapterSlugs()
  .map((slug) => ({ slug, name: getChapterInfo(slug)?.name ?? slug }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Template variable resolution
// ---------------------------------------------------------------------------

export function getTemplateVariables(): Record<string, string> {
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

export function resolveHref(
  href: string,
  variables: Record<string, string>,
): string {
  return href.replace(
    /\{\{([\w-]+)\}\}/g,
    (_, key) => variables[key] ?? `{{${key}}}`,
  );
}

export function expandItem(
  item: NavItemRaw,
  variables: Record<string, string>,
): NavItem[] {
  if (item.separator) return [{ label: "", separator: true }];
  if (item.type === "heading")
    return [{ label: item.label ?? "", type: "heading" }];

  if (item.template === "chapters") {
    return chapters.map(({ slug, name }) => {
      const chapterVars = {
        ...variables,
        chapter: name,
        "chapter-slug": slug,
      };
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

// ---------------------------------------------------------------------------
// Resolve navigation from the statically imported JSON
// ---------------------------------------------------------------------------

const FALLBACK_NAV: NavigationConfig = {
  items: [{ label: "Home", href: "/" }],
};

/**
 * Resolve the navigation config using the build-time JSON import.
 * Safe for use in client components (no fs dependency).
 */
export function getResolvedNavigation(): NavigationConfig {
  try {
    const config = navigationJson as NavigationConfigRaw;
    const variables = getTemplateVariables();

    return {
      items: config.items.flatMap((item) => expandItem(item, variables)),
    };
  } catch {
    return FALLBACK_NAV;
  }
}
