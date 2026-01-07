import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Membership",
  description: "Join Randonneurs Ontario and participate in brevets and populaires across the province.",
};

const currentSeason = process.env.NEXT_PUBLIC_CURRENT_SEASON || "current";

const membershipTiers = [
  {
    name: "Trial Member",
    price: "FREE",
    requirement: "+ Ontario Cycling Membership",
    description:
      "There is no charge for rider for their first event, no matter the distance. First time riders must have an Ontario Cycling Membership through Randonneurs Ontario or another Ontario Cycling affiliated club.",
  },
  {
    name: "Individual Membership",
    price: "$40.00 CDN",
    requirement: "+ Ontario Cycling Membership",
    description:
      "Full members may register for all standard rides throughout the season at no additional cost, can vote at the Annual General Meeting, and are invited to the Annual Awards dinner.",
  },
  {
    name: "Family Membership",
    price: "$40.00 CDN",
    requirement: "+ Ontario Cycling Membership per family member",
    description:
      "The Family Membership receives all of the benefits of individual memberships, and is for a family living at the same address.",
  },
];

export default function MembershipPage() {
  return (
    <PageShell>
      {/* Header */}
      <div className="content-container pt-20 md:pt-28">
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight">
          Become a member of Randonneurs Ontario
        </h1>
        <p className="mt-6 text-lg leading-relaxed">
          For all sanctioned rides, we require riders to have Ontario Cycling (OC) membership. If you're not an OC member, you can purchase a membership during registration.
        </p>
        <p className="mt-6 text-lg leading-relaxed">Membership is valid for the {currentSeason} season.</p>
      </div>

      {/* Membership Tiers */}
      <div className="content-container py-8">
        <div className="space-y-8">
          {membershipTiers.map((tier) => {
            const isFree = tier.price === "FREE";
            return (
              <div
                key={tier.name}
                className={`rounded-xl border p-6 md:p-8 ${
                  isFree
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
                        {tier.name}
                      </h2>
                      {isFree && (
                        <span className="text-xs font-medium tracking-wide uppercase text-primary">
                          First-time riders
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-lg">
                      <span className="font-medium">{tier.price}</span>
                      <span className="text-muted-foreground"> {tier.requirement}</span>
                    </p>
                  </div>
                  <Button asChild size="sm" className="shrink-0">
                    <Link
                      href={`https://ccnbikes.com/#!/events/randonneurs-ontario-membership-${currentSeason}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Join
                    </Link>
                  </Button>
                </div>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  {tier.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
