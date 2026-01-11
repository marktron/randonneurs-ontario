import { PageShell } from "@/components/page-shell";
import { PageHero } from "@/components/page-hero";
import { MarkdownContent } from "@/components/markdown-content";
import { getPage, getAllPages } from "@/lib/content";
import { notFound } from "next/navigation";
import { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const pages = getAllPages();
  return pages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);

  if (!page) {
    return { title: "Not Found" };
  }

  return {
    title: page.title,
    description: page.description,
  };
}

export default async function ContentPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getPage(slug);

  if (!page) {
    notFound();
  }

  return (
    <PageShell>
      <PageHero
        image="/toronto.jpg"
        eyebrow="Information"
        title={page.title}
        description={page.description}
      />
      <div className="content-container py-16 md:py-20">
        <MarkdownContent content={page.content} />
      </div>
    </PageShell>
  );
}
