import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { SearchInputMenu } from "@canva/app-ui-kit";

interface SearchBarProps {
  onSearch: (query: string) => void;
}

/** Debounce delay — search only fires this long after the user stops typing. */
const DEBOUNCE_MS = 300;

export function SearchBar({ onSearch }: SearchBarProps) {
  const intl = useIntl();
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cancel any pending debounced search on unmount.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Search only after the user pauses typing. We deliberately do NOT wire the
  // Kit's onChangeComplete (which fires on blur/Enter): Canva's iframe can emit
  // repeated blur events, each of which would fire an immediate, un-debounced
  // search. The debounce alone gives the "wait until I've finished typing"
  // behavior and one search per query.
  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onSearch(next.trim()), DEBOUNCE_MS);
    },
    [onSearch],
  );

  const clearSearch = useCallback(() => {
    clearTimeout(timerRef.current); // cancel a pending search so it can't win
    setValue("");
    onSearch("");
  }, [onSearch]);

  return (
    <SearchInputMenu
      value={value}
      placeholder={intl.formatMessage({
        defaultMessage: "Search royalty-free music",
        description:
          "Placeholder text in the search input at the top of the music app.",
      })}
      ariaLabel={intl.formatMessage({
        defaultMessage: "Search royalty-free music",
        description: "Accessible label for the music search input.",
      })}
      onChange={handleChange}
      onClear={clearSearch}
    />
  );
}
