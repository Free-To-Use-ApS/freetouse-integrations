import { Box, Button, Rows } from "@canva/app-ui-kit";
import type { Category } from "@freetouse/api";
import "../styles/app.css";

interface CategoryBarProps {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryBar({
  categories,
  activeId,
  onSelect,
}: CategoryBarProps) {
  return (
    <Box className="ftu-category-bar">
      <Button
        variant={activeId === null ? "primary" : "secondary"}
        onClick={() => onSelect(null)}
      >
        All
      </Button>
      {categories.map((cat) => (
        <Button
          key={cat.id}
          variant={activeId === cat.id ? "primary" : "secondary"}
          onClick={() => onSelect(cat.id)}
        >
          {cat.name}
        </Button>
      ))}
    </Box>
  );
}
