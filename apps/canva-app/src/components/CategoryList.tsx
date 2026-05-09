import { useCallback, useEffect, useRef } from "react";
import type { Category } from "@freetouse/api";
import {
  loadCategoryScroll,
  persistCategoryScroll,
} from "../utils/storage";

interface CategoryListProps {
  categories: Category[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string | null) => void;
}

/**
 * Skeleton pill widths (rem) — varied to mimic the natural rhythm of real
 * category names.
 */
const SKELETON_WIDTHS_REM = [3.5, 4.5, 5.25, 4, 5.75, 3.75, 4.5, 5];

function CategoryPillSkeleton({ widthRem }: { widthRem: number }) {
  return (
    <div
      className="category-pill skeleton skeleton-pill"
      style={{ width: `${widthRem}rem` }}
      aria-hidden="true"
    >
      {" "}
    </div>
  );
}

export function CategoryList({
  categories,
  activeId,
  loading,
  onSelect,
}: CategoryListProps) {
  const scrollRestoredRef = useRef(false);
  const elRef = useRef<HTMLDivElement | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Persist scrollLeft on scroll (debounced)
  function handleScroll() {
    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      if (elRef.current) {
        persistCategoryScroll(elRef.current.scrollLeft);
      }
    }, 150);
  }

  // Callback ref: attaches scroll listener and restores scrollLeft on mount
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    if (elRef.current) {
      elRef.current.removeEventListener("scroll", handleScroll);
    }
    elRef.current = node;
    if (!node) return;

    node.addEventListener("scroll", handleScroll, { passive: true });

    // Restore horizontal scroll once on mount
    if (!scrollRestoredRef.current) {
      scrollRestoredRef.current = true;
      const savedScroll = loadCategoryScroll();
      if (savedScroll && elRef.current) {
        requestAnimationFrame(() => {
          if (elRef.current) {
            elRef.current.scrollLeft = savedScroll;
          }
        });
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(persistTimerRef.current);
      if (elRef.current) {
        elRef.current.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  if (loading && categories.length === 0) {
    return (
      <div
        className="categories"
        aria-busy="true"
        aria-label="Loading categories"
      >
        {SKELETON_WIDTHS_REM.map((w, i) => (
          <CategoryPillSkeleton key={i} widthRem={w} />
        ))}
      </div>
    );
  }

  if (categories.length === 0) return null;

  return (
    <div className="categories" role="tablist" ref={setScrollRef}>
      <button
        type="button"
        role="tab"
        aria-selected={activeId === null}
        className={`category-pill ${activeId === null ? "active" : ""}`}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          role="tab"
          aria-selected={activeId === cat.id}
          className={`category-pill ${activeId === cat.id ? "active" : ""}`}
          onClick={() => onSelect(activeId === cat.id ? null : cat.id)}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
