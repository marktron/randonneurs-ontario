'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from '@/components/ui/input-group'

interface RiderListItem {
  slug: string
  firstName: string
  lastName: string
}

interface RiderDirectoryProps {
  riders: RiderListItem[]
}

/**
 * Group riders by the first letter of their last name
 */
function groupRidersByLastName(riders: RiderListItem[]): Map<string, RiderListItem[]> {
  const groups = new Map<string, RiderListItem[]>()

  for (const rider of riders) {
    const firstLetter = (rider.lastName[0] || '#').toUpperCase()
    const existing = groups.get(firstLetter) || []
    existing.push(rider)
    groups.set(firstLetter, existing)
  }

  return groups
}

export function RiderDirectory({ riders }: RiderDirectoryProps) {
  const [search, setSearch] = useState('')

  const filteredRiders = useMemo(() => {
    if (!search.trim()) return riders

    const query = search.toLowerCase()
    return riders.filter((rider) => {
      const fullName = `${rider.firstName} ${rider.lastName}`.toLowerCase()
      return fullName.includes(query)
    })
  }, [riders, search])

  const groupedRiders = useMemo(() => groupRidersByLastName(filteredRiders), [filteredRiders])

  // Sort the group keys alphabetically
  const sortedGroups = Array.from(groupedRiders.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  const clearSearch = () => setSearch('')

  return (
    <div className="space-y-8">
      {/* Search */}
      <div className="max-w-md">
        <InputGroup>
          <InputGroupAddon>
            <Search className="h-4 w-4" aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search by name…"
            aria-label="Search riders by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton onClick={clearSearch} aria-label="Clear search" size="icon-xs">
                <X className="h-3.5 w-3.5" />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </div>

      {/* Live region for screen reader announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {search.trim()
          ? `${filteredRiders.length} rider${filteredRiders.length === 1 ? '' : 's'} found`
          : ''}
      </div>

      {/* Grouped list */}
      {filteredRiders.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          No riders found matching &ldquo;{search}&rdquo;
        </p>
      ) : (
        <div className="space-y-10">
          {sortedGroups.map(([letter, riderGroup]) => (
            <section key={letter} aria-labelledby={`group-${letter}`}>
              <header className="mb-4 pb-2 border-b border-border">
                <h2 id={`group-${letter}`} className="font-serif text-2xl tracking-tight">
                  {letter}
                </h2>
              </header>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
                {riderGroup.map((rider) => (
                  <li key={rider.slug}>
                    <Link
                      href={`/riders/${rider.slug}`}
                      className="block py-1.5 text-foreground hover:text-primary transition-colors"
                    >
                      {rider.firstName} {rider.lastName}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
