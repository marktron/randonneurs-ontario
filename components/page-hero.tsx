import Image from "next/image";

interface PageHeroProps {
  image: string;
  eyebrow: string;
  title: string;
  description: string;
}

export function PageHero({ image, eyebrow, title, description }: PageHeroProps) {
  return (
    <div className="relative border-b border-border overflow-hidden">
      <Image
        src={image}
        alt=""
        fill
        className="object-cover editorial-image"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/70 to-neutral-900/30" />
      <div className="relative mx-auto max-w-4xl px-6 py-16 md:py-20">
        <p className="eyebrow-hero text-neutral-200 text-shadow-lg">
          {eyebrow}
        </p>
        <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl tracking-tight mt-2 text-neutral-100 text-shadow-lg">
          {title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-200 max-w-xl text-shadow-lg">
          {description}
        </p>
      </div>
    </div>
  );
}
