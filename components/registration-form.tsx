"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { registerForEvent } from "@/lib/actions/register";

const STORAGE_KEY = "ro-registration";

interface SavedRegistrationData {
  name: string;
  email: string;
  gender: string;
  shareRegistration: boolean;
}

function getSavedData(): SavedRegistrationData | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveData(data: SavedRegistrationData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

interface RegistrationFormProps {
  eventId: string;
  isPermanent?: boolean;
  /** "card" shows border/title container, "plain" for use in modals */
  variant?: "card" | "plain";
}

export function RegistrationForm({ eventId, isPermanent, variant = "card" }: RegistrationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [shareRegistration, setShareRegistration] = useState(false);
  const [gender, setGender] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load saved data on mount
  useEffect(() => {
    const saved = getSavedData();
    if (saved) {
      setName(saved.name);
      setEmail(saved.email);
      setGender(saved.gender);
      setShareRegistration(saved.shareRegistration);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const notes = formData.get("notes") as string;

    startTransition(async () => {
      const result = await registerForEvent({
        eventId,
        name,
        email,
        gender: gender || undefined,
        shareRegistration,
        notes: notes || undefined,
      });

      if (result.success) {
        // Save form data to localStorage for next registration
        saveData({ name, email, gender, shareRegistration });
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.error || "Registration failed");
      }
    });
  }

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    variant === "card" ? (
      <div className="lg:sticky lg:top-24 rounded-2xl border border-border bg-card p-6 md:p-8">
        {children}
      </div>
    ) : (
      <>{children}</>
    );

  if (success) {
    return (
      <Wrapper>
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl tracking-tight mb-2">You&apos;re registered!</h2>
          <p className="text-sm text-muted-foreground">
            See you at the start line.
          </p>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {variant === "card" && <h2 className="font-serif text-2xl tracking-tight mb-6">Register</h2>}

      {isPermanent && (
        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 text-sm">
          <p className="font-medium mb-1">This is a Permanent</p>
          <p className="text-muted-foreground">
            Join this rider on their scheduled permanent ride, or{" "}
            <a href="/register/permanent" className="text-primary hover:underline underline-offset-2">
              schedule your own
            </a>.
          </p>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Your full name"
            required
            disabled={isPending}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            disabled={isPending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <Label htmlFor="gender">
            Gender
            <span className="text-muted-foreground font-normal ml-1">(optional)</span>
          </Label>
          <Select key={gender || 'empty'} value={gender} onValueChange={setGender} disabled={isPending}>
            <SelectTrigger id="gender" className="w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Male</SelectItem>
              <SelectItem value="F">Female</SelectItem>
              <SelectItem value="X">Non-binary / Other</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Audax Club Parisien uses this for ridership statistics.
          </p>
        </div>

        {/* Share Registration */}
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="share"
              checked={shareRegistration}
              onCheckedChange={(checked) => setShareRegistration(checked === true)}
              className="mt-0.5"
              disabled={isPending}
            />
            <div className="space-y-1">
              <Label htmlFor="share" className="cursor-pointer">
                Share my registration
              </Label>
              <p className="text-xs text-muted-foreground">
                Share your name with other riders before the event. All riders will appear on the results after the event.
              </p>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">
            Notes for the organizer
            <span className="text-muted-foreground font-normal ml-1">(optional)</span>
          </Label>
          <Textarea
            id="notes"
            name="notes"
            placeholder="Any special requirements or information..."
            rows={3}
            disabled={isPending}
          />
        </div>

        {/* Submit */}
        <Button type="submit" className="w-full" size="lg" disabled={isPending}>
          {isPending ? "Registering..." : "Register"}
        </Button>
      </form>
    </Wrapper>
  );
}
