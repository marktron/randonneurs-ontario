"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import type { RiderMatchCandidate } from "@/lib/actions/rider-match"

interface RiderMatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: RiderMatchCandidate[]
  submittedFirstName: string
  submittedLastName: string
  onSelectRider: (riderId: string) => void
  onCreateNew: () => void
  isPending: boolean
}

const NEW_RIDER_VALUE = "__new__"

export function RiderMatchDialog({
  open,
  onOpenChange,
  candidates,
  submittedFirstName,
  submittedLastName,
  onSelectRider,
  onCreateNew,
  isPending,
}: RiderMatchDialogProps) {
  const [selectedValue, setSelectedValue] = useState<string>("")

  const handleContinue = () => {
    if (!selectedValue) return

    if (selectedValue === NEW_RIDER_VALUE) {
      onCreateNew()
    } else {
      onSelectRider(selectedValue)
    }
  }

  const submittedName = `${submittedFirstName} ${submittedLastName}`.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Have you ridden with us before?</DialogTitle>
          <DialogDescription>
            We found some riders with similar names. If you&apos;ve participated in past
            events, select your name below to link this registration to your history.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={selectedValue}
          onValueChange={setSelectedValue}
          disabled={isPending}
          className="gap-0 divide-y divide-border"
        >
          {/* Candidate riders */}
          {candidates.map((candidate) => (
            <div
              key={candidate.id}
              className="flex items-center gap-3 py-3"
            >
              <RadioGroupItem value={candidate.id} id={candidate.id} />
              <Label
                htmlFor={candidate.id}
                className="flex-1 cursor-pointer flex items-center justify-between"
              >
                <span className="font-medium">{candidate.fullName}</span>
                <span className="text-sm text-muted-foreground">
                  {candidate.firstSeason && (
                    <span>Since {candidate.firstSeason}</span>
                  )}
                  {candidate.firstSeason && candidate.totalRides > 0 && (
                    <span className="mx-1">&middot;</span>
                  )}
                  {candidate.totalRides > 0 && (
                    <span>
                      {candidate.totalRides} {candidate.totalRides === 1 ? "ride" : "rides"}
                    </span>
                  )}
                </span>
              </Label>
            </div>
          ))}

          {/* New rider option */}
          <div className="flex items-center gap-3 py-3 pt-4">
            <RadioGroupItem value={NEW_RIDER_VALUE} id={NEW_RIDER_VALUE} />
            <Label htmlFor={NEW_RIDER_VALUE} className="flex-1 cursor-pointer">
              <span className="font-medium">I&apos;m a new rider</span>
              <span className="block text-sm text-muted-foreground">
                Create a new profile for {submittedName}
              </span>
            </Label>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!selectedValue || isPending}
          >
            {isPending ? "Processing..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
