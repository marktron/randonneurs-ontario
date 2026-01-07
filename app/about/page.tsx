import { PageShell } from "@/components/page-shell";
import { PageHero } from "@/components/page-hero";

export const metadata = {
  title: "About Us",
  description: "Learn about Randonneurs Ontario, a volunteer-run cycling organization dedicated to non-competitive long-distance cycling.",
};

export default function AboutPage() {
  return (
    <PageShell>
      <PageHero
        image="/toronto.jpg"
        eyebrow="About"
        title="About Us"
        description="Randonneurs Ontario is a volunteer-run cycling organization dedicated to non-competitive long-distance cycling in Ontario."
      />
      <div className="content-container py-16 md:py-20">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <p className="text-lg text-muted-foreground">
            Content coming soon.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
