interface SearchResultsHeaderProps {
  /** Total count, e.g. 24 */
  count: number;
  /** Noun for the results, e.g. "cruises" */
  noun: string;
}

export function SearchResultsHeader({ count, noun }: SearchResultsHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-muted-foreground">
        {count} {count === 1 ? noun.replace(/s$/, "") : noun} found
      </p>
      <button
        type="button"
        className="text-sm font-semibold text-[#C59746] transition-colors hover:text-[#E89E4A]"
        aria-label={`Ask AI about these ${noun}`}
      >
        Ask AI about these
      </button>
    </div>
  );
}
