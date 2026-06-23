import { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { SearchInputMenu } from "@canva/app-ui-kit";

interface SearchBarProps {
  onSearch: (query: string) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const intl = useIntl();
  const [value, setValue] = useState("");

  // Preserve the 300ms debounce — SearchInputMenu has no built-in debounce.
  const debouncedSearch = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return (q: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => onSearch(q.trim()), 300);
    };
  }, [onSearch]);

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      debouncedSearch(next);
    },
    [debouncedSearch],
  );

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
      onClear={() => {
        setValue("");
        onSearch("");
      }}
      onChangeComplete={(q) => onSearch(q.trim())}
    />
  );
}
