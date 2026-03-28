import { useCallback, useRef, useState } from "react";
import { TextInput } from "@canva/app-ui-kit";

interface SearchInputProps {
  onSearch: (query: string) => void;
}

export function SearchInput({ onSearch }: SearchInputProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback(
    (val: string) => {
      setValue(val);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSearch(val.trim());
      }, 300);
    },
    [onSearch]
  );

  return (
    <TextInput
      value={value}
      onChange={handleChange}
      placeholder="Search music..."
    />
  );
}
