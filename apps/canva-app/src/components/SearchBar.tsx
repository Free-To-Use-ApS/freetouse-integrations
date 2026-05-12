import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";

interface SearchBarProps {
  onSearch: (query: string) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const intl = useIntl();
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearch(value.trim()), 300);
    return () => clearTimeout(timerRef.current);
  }, [value, onSearch]);

  const placeholder = intl.formatMessage({
    defaultMessage: "Search royalty-free music...",
    description:
      "Placeholder text in the search input at the top of the music app.",
  });

  const clearLabel = intl.formatMessage({
    defaultMessage: "Clear search",
    description:
      "Accessible label for the button that clears the current search query.",
  });

  return (
    <div className="search-container">
      <input
        className="search-input"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="search-clear"
          onClick={() => setValue("")}
          aria-label={clearLabel}
        >
          &times;
        </button>
      ) : (
        <svg
          className="search-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="6.5" cy="6.5" r="5" />
          <line x1="10.5" y1="10.5" x2="15" y2="15" />
        </svg>
      )}
    </div>
  );
}
