import fs from "fs";
import path from "path";
import matter from "gray-matter";

const contentDirectory = path.join(process.cwd(), "content/pages");

export interface PageContent {
  slug: string;
  title: string;
  description: string;
  lastUpdated: string;
  content: string;
}

export interface PageMeta {
  slug: string;
  title: string;
  description: string;
  lastUpdated: string;
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
      content,
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
