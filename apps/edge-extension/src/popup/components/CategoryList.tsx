import { useCallback, useEffect, useRef } from "react";
import type { Category } from "@freetouse/api";

const CAT_SCROLL_KEY = "ftu_category_scroll";

interface CategoryListProps {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryList({ categories, activeId, onSelect }: CategoryListProps) {
  const scrollRestoredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const elRef = useRef<HTMLDivElement | null>(null);

  // Callback ref: fires when the div mounts (or remounts), restores scroll + attaches listener
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    // Clean up previous listener
    if (elRef.current) {
      elRef.current.removeEventListener("scroll", handleScroll);
    }
    elRef.current = node;
    if (!node) return;

    // Attach persist listener
    node.addEventListener("scroll", handleScroll, { passive: true });

    // Restore scroll position on first mount
    if (!scrollRestoredRef.current) {
      scrollRestoredRef.current = true;
      chrome.storage.session.get(CAT_SCROLL_KEY, (result) => {
        const savedScroll = result[CAT_SCROLL_KEY];
        if (savedScroll && elRef.current) {
          requestAnimationFrame(() => {
            if (elRef.current) {
              elRef.current.scrollLeft = savedScroll;
            }
          });
        }
      });
    }
  }, []);

  function handleScroll() {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (elRef.current) {
        chrome.storage.session.set({ [CAT_SCROLL_KEY]: elRef.current.scrollLeft });
      }
    }, 150);
  }

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      if (elRef.current) {
        elRef.current.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  if (categories.length === 0) return null;

  return (
    <div className="categories" ref={setScrollRef}>
      <button
        className={`category-pill ${activeId === null ? "active" : ""}`}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          className={`category-pill ${activeId === cat.id ? "active" : ""}`}
          onClick={() => onSelect(activeId === cat.id ? null : cat.id)}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
