import { useEffect, useRef, useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearch(value.trim()), 300);
    return () => clearTimeout(timerRef.current);
  }, [value, onSearch]);

  return (
    <div className="search-container">
      <input
        className="search-input"
        type="text"
        placeholder="Search royalty-free music..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {value ? (
        <button className="search-clear" onClick={() => setValue("")}>
          &times;
        </button>
      ) : (
        <svg className="search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6.5" cy="6.5" r="5" />
          <line x1="10.5" y1="10.5" x2="15" y2="15" />
        </svg>
      )}
    </div>
  );
}
