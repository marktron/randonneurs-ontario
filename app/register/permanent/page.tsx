import { PageShell } from "@/components/page-shell";
import { PermanentRegistrationForm } from "@/components/permanent-registration-form";
import { getActiveRoutes } from "@/lib/data/routes";
import Link from "next/link";

export const metadata = {
  title: "Register for a Permanent",
  description: "Schedule a permanent ride on any active route. Ride at your own pace, on your own schedule.",
};

export default async function PermanentRegistrationPage() {
  const routes = await getActiveRoutes();

  return (
    <PageShell>
      <div className="content-container-wide py-12 md:py-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
          {/* Left Column - Information */}
          <div className="flex-1 min-w-0">
            <div className="mb-8">
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-muted-foreground mb-3">
                Permanents
              </p>
              <h1 className="font-serif text-4xl md:text-5xl tracking-tight">
                Schedule a Permanent
              </h1>
            </div>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-lg text-muted-foreground leading-relaxed">
                Permanent rides let you complete any of our active routes on your own schedule.
                Unlike scheduled brevets, you choose when and where to start.
              </p>

              <div className="mt-10 space-y-8">
                <div>
                  <h2 className="font-serif text-xl tracking-tight mb-3">
                    How it works
                  </h2>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">1</span>
                      <span>Choose a route from our list of active routes</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">2</span>
                      <span>Select your start date, time, and location</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">3</span>
                      <span>Submit your registration at least 2 weeks in advance</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">4</span>
                      <span>You&apos;ll receive a control card and route details by email</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">5</span>
                      <span>Complete the ride and submit your control card for validation</span>
                    </li>
                  </ol>
                </div>

                <div>
                  <h2 className="font-serif text-xl tracking-tight mb-3">
                    Requirements
                  </h2>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>You must be a current Randonneurs Ontario member</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>Permanent rides must be scheduled at least 2 weeks in advance</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>Same time limits apply as for regular brevets</span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h2 className="font-serif text-xl tracking-tight mb-3">
                    Questions?
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    See our{" "}
                    <Link href="/intro" className="text-primary hover:underline underline-offset-2">
                      introduction to randonneuring
                    </Link>{" "}
                    or{" "}
                    <Link href="/contact" className="text-primary hover:underline underline-offset-2">
                      contact your chapter VP
                    </Link>{" "}
                    if you have any questions about permanents.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Registration Form */}
          <div className="lg:w-[420px] lg:shrink-0">
            <PermanentRegistrationForm routes={routes} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
