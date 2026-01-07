import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

interface ArrowLinkProps {
  href: string;
  children: React.ReactNode;
}

export function ArrowLink({ href, children }: ArrowLinkProps) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 text-base font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
    >
      {children}
      <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
