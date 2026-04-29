'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { saveNavigation } from '@/lib/actions/navigation'
import type { NavigationConfigRaw, NavItemRaw } from '@/types/navigation'
import type { PageMeta } from '@/lib/content'

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Internal representation of a child item's "kind" in the editor */
type ChildKind = 'link' | 'separator' | 'heading' | 'chapter-template'

interface NavigationEditorProps {
  initialConfig: NavigationConfigRaw | null
  pages: PageMeta[]
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Tag each item with a stable editor-only `_id` for React keys and dnd-kit */
interface NavItemWithId extends NavItemRaw {
  _id: string
  children?: NavItemChildWithId[]
}

interface NavItemChildWithId extends NavItemRaw {
  _id: string
}

function addIds(items: NavItemRaw[]): NavItemWithId[] {
  return items.map((item) => ({
    ...item,
    _id: generateId(),
    children: item.children?.map((child) => ({
      ...child,
      _id: generateId(),
    })),
  }))
}

function stripIds(items: NavItemWithId[]): NavItemRaw[] {
  function cleanItem(raw: NavItemRaw): NavItemRaw {
    const item = { ...raw }
    // Auto-detect external links from href
    delete item.external
    if (isExternalHref(item.href)) {
      item.external = true
    }
    return item
  }

  return items.map((item) => {
    const { _id, children, ...rest } = item
    const clean: NavItemRaw = cleanItem(rest)
    if (children && children.length > 0) {
      clean.children = children.map((child) => {
        const { _id: _, ...childRest } = child
        return cleanItem(childRest)
      })
    }
    return clean
  })
}

function isExternalHref(href: string | undefined): boolean {
  return !!href && (href.startsWith('http://') || href.startsWith('https://'))
}

function childKindOf(child: NavItemRaw): ChildKind {
  if (child.separator) return 'separator'
  if (child.type === 'heading') return 'heading'
  if (child.template === 'chapters') return 'chapter-template'
  return 'link'
}

function childKindLabel(kind: ChildKind): string {
  switch (kind) {
    case 'link':
      return 'Link'
    case 'separator':
      return 'Separator'
    case 'heading':
      return 'Heading'
    case 'chapter-template':
      return 'Chapter Template'
  }
}

function makeDefaultChild(kind: ChildKind): NavItemChildWithId {
  const base: NavItemChildWithId = { _id: generateId() }
  switch (kind) {
    case 'link':
      base.label = ''
      base.href = ''
      break
    case 'separator':
      base.separator = true
      break
    case 'heading':
      base.label = ''
      base.type = 'heading'
      break
    case 'chapter-template':
      base.label = '{{chapter}}'
      base.href = ''
      base.template = 'chapters'
      break
  }
  return base
}

// --------------------------------------------------------------------------
// Sortable top-level item
// --------------------------------------------------------------------------

interface SortableTopItemProps {
  item: NavItemWithId
  isOpen: boolean
  onToggle: (open: boolean) => void
  onUpdate: (updated: NavItemWithId) => void
  onDelete: () => void
  pages: PageMeta[]
}

function SortableTopItem({
  item,
  isOpen,
  onToggle,
  onUpdate,
  onDelete,
  pages,
}: SortableTopItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item._id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const childCount = item.children?.length ?? 0
  const isDirectLink = !item.children || item.children.length === 0

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={isDragging ? 'ring-2 ring-ring' : ''}>
        <Collapsible open={isOpen} onOpenChange={onToggle}>
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              type="button"
              className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>

            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 flex-1 text-left text-sm font-medium hover:text-foreground/80"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span>{item.label || '(untitled)'}</span>
                {item.style === 'cta' && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    CTA
                  </span>
                )}
                {isDirectLink && item.href && (
                  <span className="text-xs text-muted-foreground font-normal">{item.href}</span>
                )}
                {!isDirectLink && (
                  <span className="text-xs text-muted-foreground font-normal">
                    {childCount} item{childCount !== 1 ? 's' : ''}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${item.label || 'item'}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &ldquo;{item.label || 'item'}&rdquo;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the menu item
                    {item.children && item.children.length > 0
                      ? ` and its ${item.children.length} child item${item.children.length !== 1 ? 's' : ''}`
                      : ''}
                    . You can undo by discarding your unsaved changes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <CollapsibleContent>
            <CardContent className="pt-0 pb-4 space-y-4">
              <TopItemFields item={item} onUpdate={onUpdate} />
              <ChildrenEditor item={item} onUpdate={onUpdate} pages={pages} />
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  )
}

// --------------------------------------------------------------------------
// Top-level item fields
// --------------------------------------------------------------------------

interface TopItemFieldsProps {
  item: NavItemWithId
  onUpdate: (updated: NavItemWithId) => void
}

function TopItemFields({ item, onUpdate }: TopItemFieldsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor={`label-${item._id}`}>Label</Label>
        <Input
          id={`label-${item._id}`}
          value={item.label ?? ''}
          onChange={(e) => onUpdate({ ...item, label: e.target.value })}
          placeholder="Menu label"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`href-${item._id}`}>
          URL <span className="text-muted-foreground font-normal">(optional for dropdowns)</span>
        </Label>
        <Input
          id={`href-${item._id}`}
          value={item.href ?? ''}
          onChange={(e) => onUpdate({ ...item, href: e.target.value || undefined })}
          placeholder="/path or https://..."
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`style-${item._id}`}>Style</Label>
        <Select
          value={item.style ?? 'default'}
          onValueChange={(v) =>
            onUpdate({
              ...item,
              style: v === 'cta' ? 'cta' : undefined,
            })
          }
        >
          <SelectTrigger id={`style-${item._id}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="cta">CTA (Call to Action)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Children editor (sortable list + add button)
// --------------------------------------------------------------------------

interface ChildrenEditorProps {
  item: NavItemWithId
  onUpdate: (updated: NavItemWithId) => void
  pages: PageMeta[]
}

function ChildrenEditor({ item, onUpdate, pages }: ChildrenEditorProps) {
  const children = item.children ?? []
  const childIds = children.map((c) => c._id)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = children.findIndex((c) => c._id === active.id)
    const newIndex = children.findIndex((c) => c._id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onUpdate({
      ...item,
      children: arrayMove(children, oldIndex, newIndex),
    })
  }

  function addChild(kind: ChildKind) {
    onUpdate({
      ...item,
      children: [...children, makeDefaultChild(kind)],
    })
  }

  function updateChild(childId: string, updated: NavItemChildWithId) {
    onUpdate({
      ...item,
      children: children.map((c) => (c._id === childId ? updated : c)),
    })
  }

  function deleteChild(childId: string) {
    onUpdate({
      ...item,
      children: children.filter((c) => c._id !== childId),
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Dropdown Items</Label>
      </div>

      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No children. This item will render as a direct link.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {children.map((child) => (
                <SortableChildItem
                  key={child._id}
                  child={child}
                  onUpdate={(updated) => updateChild(child._id, updated)}
                  onDelete={() => deleteChild(child._id)}
                  pages={pages}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AddChildMenu onAdd={addChild} />
    </div>
  )
}

// --------------------------------------------------------------------------
// Sortable child item
// --------------------------------------------------------------------------

interface SortableChildItemProps {
  child: NavItemChildWithId
  onUpdate: (updated: NavItemChildWithId) => void
  onDelete: () => void
  pages: PageMeta[]
}

function SortableChildItem({ child, onUpdate, onDelete, pages }: SortableChildItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: child._id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const kind = childKindOf(child)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-muted/30 p-3 ${isDragging ? 'ring-2 ring-ring' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground mt-0.5"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0">
          {kind === 'separator' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-muted px-2 py-1 rounded">Separator</span>
            </div>
          ) : kind === 'heading' ? (
            <div>
              <span className="text-xs font-medium bg-muted px-2 py-1 rounded mb-1 inline-block">
                Heading
              </span>
              <Input
                value={child.label ?? ''}
                onChange={(e) => onUpdate({ ...child, label: e.target.value })}
                placeholder="Heading text"
                className="h-8 text-sm"
              />
            </div>
          ) : kind === 'chapter-template' ? (
            <div>
              <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded mb-1 inline-block">
                Chapter Template
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  value={child.label ?? ''}
                  onChange={(e) => onUpdate({ ...child, label: e.target.value })}
                  placeholder="{{chapter}}"
                  className="h-8 text-sm"
                />
                <Input
                  value={child.href ?? ''}
                  onChange={(e) => onUpdate({ ...child, href: e.target.value })}
                  placeholder="/path/{{chapter-slug}}"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          ) : (
            <div>
              <span className="text-xs font-medium bg-muted px-2 py-1 rounded mb-1 inline-block">
                Link
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  value={child.label ?? ''}
                  onChange={(e) => onUpdate({ ...child, label: e.target.value })}
                  placeholder="Link label"
                  className="h-8 text-sm"
                />
                <div className="relative">
                  <Input
                    value={child.href ?? ''}
                    onChange={(e) => onUpdate({ ...child, href: e.target.value })}
                    placeholder="/page-slug or https://..."
                    className="h-8 text-sm"
                    list={`pages-${child._id}`}
                  />
                  {!isExternalHref(child.href) && pages.length > 0 && (
                    <datalist id={`pages-${child._id}`}>
                      {pages.map((p) => (
                        <option key={p.slug} value={`/${p.slug}`}>
                          {p.title}
                        </option>
                      ))}
                    </datalist>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
              aria-label="Delete child"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this item?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the {childKindLabel(kind).toLowerCase()} from the dropdown. You can
                undo by discarding your unsaved changes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Add child menu
// --------------------------------------------------------------------------

interface AddChildMenuProps {
  onAdd: (kind: ChildKind) => void
}

function AddChildMenu({ onAdd }: AddChildMenuProps) {
  const [open, setOpen] = useState(false)

  const kinds: ChildKind[] = ['link', 'separator', 'heading', 'chapter-template']

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full border-dashed"
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add child item
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 p-2 rounded-md border border-dashed">
      {kinds.map((kind) => (
        <Button
          key={kind}
          variant="secondary"
          size="sm"
          onClick={() => {
            onAdd(kind)
            setOpen(false)
          }}
        >
          {childKindLabel(kind)}
        </Button>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  )
}

// --------------------------------------------------------------------------
// Main editor component
// --------------------------------------------------------------------------

export function NavigationEditor({ initialConfig, pages }: NavigationEditorProps) {
  const [items, setItems] = useState<NavItemWithId[]>(() => addIds(initialConfig?.items ?? []))
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  // Snapshot of last-saved state for change detection and discard
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(initialConfig?.items ?? [])
  )
  const hasChanges = useMemo(
    () => JSON.stringify(stripIds(items)) !== savedSnapshot,
    [items, savedSnapshot]
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const topIds = items.map((item) => item._id)

  // -- Drag & drop for top-level items --
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i._id === active.id)
    const newIndex = items.findIndex((i) => i._id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    setItems(arrayMove(items, oldIndex, newIndex))
  }

  // -- Toggle accordion --
  const toggleItem = useCallback((id: string, open: boolean) => {
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (open) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }, [])

  // -- Update a top-level item --
  const updateItem = useCallback((updated: NavItemWithId) => {
    setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)))
  }, [])

  // -- Delete a top-level item --
  const deleteItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i._id !== id))
    setOpenItems((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  // -- Discard changes --
  function discardChanges() {
    const saved: NavItemRaw[] = JSON.parse(savedSnapshot)
    setItems(addIds(saved))
    setOpenItems(new Set())
  }

  // -- Add a new top-level item --
  function addTopItem() {
    const newItem: NavItemWithId = {
      _id: generateId(),
      label: '',
      children: [],
    }
    setItems((prev) => [...prev, newItem])
    setOpenItems((prev) => new Set(prev).add(newItem._id))
  }

  // -- Save --
  async function handleSave() {
    setSaving(true)
    try {
      const config: NavigationConfigRaw = {
        items: stripIds(items),
      }
      const result = await saveNavigation(config)
      if (result.success) {
        setSavedSnapshot(JSON.stringify(config.items))
        toast.success('Navigation saved')
      } else {
        toast.error(result.error || 'Failed to save navigation')
      }
    } catch {
      toast.error('An error occurred while saving')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={topIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item) => (
              <SortableTopItem
                key={item._id}
                item={item}
                isOpen={openItems.has(item._id)}
                onToggle={(open) => toggleItem(item._id, open)}
                onUpdate={updateItem}
                onDelete={() => deleteItem(item._id)}
                pages={pages}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {items.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          No navigation items. Add one to get started.
        </p>
      )}

      <Button variant="outline" onClick={addTopItem} className="w-full border-dashed">
        <Plus className="h-4 w-4 mr-2" />
        Add top-level item
      </Button>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={discardChanges} disabled={!hasChanges || saving}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Discard changes
        </Button>
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Navigation
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
