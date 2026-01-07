import { PageShell } from "@/components/page-shell";
import { PageHero } from "@/components/page-hero";

export const metadata = {
  title: "Mailing List",
  description: "Subscribe to the Randonneurs Ontario mailing list.",
};

export default function MailingListPage() {
  return (
    <PageShell>
      <PageHero
        image="/huron.jpg"
        eyebrow="Stay Connected"
        title="Mailing List"
        description="Join the Randonlist to stay up to date with club news and events."
      />
      <div className="content-container py-16 md:py-20">
        <div className="prose prose-neutral dark:prose-invert max-w-2xl space-y-4">
          <p>
            The Randonneurs Ontario mailing list is a forum for club members to
            discuss upcoming rides and events, car pooling, and items of general
            interest, as well as a way for the club Executive and ride
            organizers to pass along information to the membership.
          </p>

          <p>
            By subscribing to the Randonlist, you are agreeing to receive
            information about Randonneurs Ontario, its events and activities.
            You also agree that from time to time, we may forward commercial or
            promotional opportunities related to Randonneurs Ontario activities
            that we think might be of interest to you. We will never sell or
            otherwise provide your email address to any other organization
            (other than as may be required by law), nor will we sell your email
            address or personal information.
          </p>

          <p>
            To subscribe, unsubscribe or modify your preferences on the
            Randonlist,{" "}
            <a
              href="mailto:list-admin@randonneursontario.ca?subject=Mailing%20List%20Query"
              className="text-primary hover:underline"
            >
              contact the List Administrator
            </a>
            .
          </p>
        </div>
      </div>
    </PageShell>
  );
}
