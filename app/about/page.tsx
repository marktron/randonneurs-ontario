import { PageShell } from "@/components/page-shell";
import { PageHero } from "@/components/page-hero";
import { MarkdownContent } from "@/components/markdown-content";
import { getPage } from "@/lib/content";
import { notFound } from "next/navigation";

export const metadata = {
  title: "About Us",
  description: "Learn about Randonneurs Ontario, a volunteer-run cycling organization dedicated to non-competitive long-distance cycling.",
};

export default function AboutPage() {
  const page = getPage("about");

  if (!page) {
    notFound();
  }

  return (
    <PageShell>
      <PageHero
        image="/toronto.jpg"
        eyebrow="About"
        title={page.title}
        description={page.description}
      />
      <div className="content-container py-16 md:py-20">
        <MarkdownContent content={page.content} />
      </div>
    </PageShell>
  );
}
