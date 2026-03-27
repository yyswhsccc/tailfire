"use client";

import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
} from "react";

import { SearchLoadingAnimation } from "./search-loading-animation";

/* -------------------------------------------------------------------------- */
/*  Context                                                                    */
/* -------------------------------------------------------------------------- */

type ProductType = "flights" | "cruises" | "hotels" | "tours";

interface SearchContextValue {
  /** Whether a navigation transition is in progress */
  isPending: boolean;
  /** Wrap a `router.push` call in this to get transition tracking */
  startSearch: (navigate: () => void) => void;
}

const SearchContext = createContext<SearchContextValue>({
  isPending: false,
  startSearch: () => {},
});

export function useSearch() {
  return useContext(SearchContext);
}

/* -------------------------------------------------------------------------- */
/*  Shell                                                                      */
/* -------------------------------------------------------------------------- */

interface SearchPageShellProps {
  children: ReactNode;
  productType: ProductType;
}

/**
 * Client wrapper for search pages.
 *
 * Provides a `useSearch()` hook that search forms call to wrap `router.push`
 * inside a React transition. While the transition is pending the component
 * overlays a branded loading animation and fades the existing content.
 */
export function SearchPageShell({ children, productType }: SearchPageShellProps) {
  const [isPending, startTransition] = useTransition();

  const startSearch = (navigate: () => void) => {
    startTransition(() => {
      navigate();
    });
  };

  return (
    <SearchContext.Provider value={{ isPending, startSearch }}>
      {isPending && (
        <div className="rounded-2xl border border-border bg-white px-6 py-8 shadow-sm">
          <SearchLoadingAnimation type={productType} />
        </div>
      )}

      <div
        className={
          isPending
            ? "pointer-events-none opacity-30 transition-opacity duration-200"
            : "transition-opacity duration-200"
        }
      >
        {children}
      </div>
    </SearchContext.Provider>
  );
}
