import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { joinArticles } from "@/content/join/articles";
import { ContentPage } from "@/components/layout/content-page";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return joinArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = joinArticles.find((a) => a.slug === slug);

  if (!article) {
    return { title: "Not Found | Phoenix Voyages" };
  }

  return {
    title: article.seoTitle,
    description: article.description,
  };
}

export default async function JoinArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = joinArticles.find((a) => a.slug === slug);

  if (!article) {
    notFound();
  }

  // Split content on double-newlines to render paragraphs and headings
  const blocks = article.content.split("\n\n").filter(Boolean);

  return (
    <ContentPage title={article.title}>
      {/* Breadcrumb */}
      <nav className="-mt-4 mb-2 text-sm text-[#1A1A1A]/50">
        <Link href="/join" className="hover:text-[#C59746]">
          Join
        </Link>{" "}
        <span className="mx-2">/</span>
        <span className="text-[#1A1A1A]/80">{article.title}</span>
      </nav>

      <Separator className="mb-6" />

      {/* Rendered content blocks */}
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          return (
            <h2
              key={i}
              className="font-display text-lg font-bold tracking-wide text-[#1A1A1A] md:text-xl"
            >
              {block.replace(/^## /, "")}
            </h2>
          );
        }
        if (block.startsWith("- ")) {
          const items = block.split("\n").filter((l) => l.startsWith("- "));
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {items.map((item, j) => (
                <li key={j}>{item.replace(/^- /, "")}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{block}</p>;
      })}

      <Separator className="mt-8" />

      {/* CTA */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <Button asChild size="lg" className="bg-[#C59746] text-white hover:bg-[#B08638]">
          <Link href="/join/register">Start Your Application</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/join">Back to Join</Link>
        </Button>
      </div>
    </ContentPage>
  );
}
