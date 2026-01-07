import { PageShell } from "@/components/page-shell";
import { PageHero } from "@/components/page-hero";

export const metadata = {
  title: "Club Policies",
  description: "Randonneurs Ontario club policies and guidelines.",
};

export default function PoliciesPage() {
  return (
    <PageShell>
      <PageHero
        image="/simcoe.jpg"
        eyebrow="Policies"
        title="Club Policies"
        description="Guidelines and policies for Randonneurs Ontario members and events."
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
