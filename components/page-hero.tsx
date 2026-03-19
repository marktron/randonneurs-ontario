import Image from 'next/image'

const HERO_IMAGES = [
  '/hero-images/ariana-kaminski-vfsb-7riFYE-unsplash.jpg',
  '/hero-images/ben-guernsey-f7DLp-oLUNo-unsplash.jpg',
  '/hero-images/denise-seddon-ZlQu2v5N2eU-unsplash.jpg',
  '/hero-images/derek-sutton-OwmmilQH_z4-unsplash.jpg',
  '/hero-images/linda-tatler-CrA4iYKOkCw-unsplash.jpg',
  '/hero-images/matthieu-petiard-fSUiELRw9l0-unsplash.jpg',
  '/hero-images/perfectus-photography-design-co-mmA6gzZNsls-unsplash.jpg',
  '/hero-images/perfectus-photography-design-co-sjEwHvLE1kc-unsplash.jpg',
]

interface PageHeroProps {
  image?: string
  eyebrow?: string
  title: string
  description?: string
  editorial?: boolean
}

export function PageHero({ image, eyebrow, title, description, editorial }: PageHeroProps) {
  const resolvedImage =
    image ||
    HERO_IMAGES[
      title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % HERO_IMAGES.length
    ]
  return (
    <div className="relative border-b border-border overflow-hidden">
      <Image src={resolvedImage} alt="" fill className="object-cover editorial-image" priority />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/70 to-neutral-900/20" />
      <div
        className={`relative py-16 md:py-20 ${editorial ? 'content-container-editorial' : 'mx-auto max-w-5xl px-6'}`}
      >
        {eyebrow && <p className="eyebrow-hero text-neutral-100 text-shadow-lg">{eyebrow}</p>}
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight text-neutral-100 text-shadow-lg">
          {title}
        </h1>
        {description && (
          <p className="mt-4 text-lg leading-relaxed text-neutral-100 text-shadow-lg">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
