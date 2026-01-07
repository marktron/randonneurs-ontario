import { PageShell } from "@/components/page-shell";
import { PageHero } from "@/components/page-hero";

export const metadata = {
  title: "What is Randonneuring?",
  description: "An introduction to randonneuring and long-distance cycling.",
};

export default function IntroPage() {
  return (
    <PageShell>
      <PageHero
        image="/ottawa.jpg"
        eyebrow="Introduction"
        title="What is Randonneuring?"
        description="An introduction to the world of long-distance cycling."
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
