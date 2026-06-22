import { useIntl } from "react-intl";
import { Carousel, Pill, Placeholder } from "@canva/app-ui-kit";
import type { Category } from "@freetouse/api";

interface CategoryListProps {
  categories: Category[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string | null) => void;
}

/** Skeleton pill widths (rem) — varied to mimic real category names. */
const SKELETON_WIDTHS_REM = [3.5, 4.5, 5.25, 4, 5.75, 3.75];

export function CategoryList({
  categories,
  activeId,
  loading,
  onSelect,
}: CategoryListProps) {
  const intl = useIntl();

  if (loading && categories.length === 0) {
    // Carousel children must be tabbable; skeletons are not, so render a
    // plain row of fixed-width Placeholder boxes instead.
    return (
      <div
        className="ftu-category-skeletons"
        aria-busy="true"
        aria-label={intl.formatMessage({
          defaultMessage: "Loading categories",
          description:
            "Accessible label shown while the list of music categories is loading.",
        })}
      >
        {SKELETON_WIDTHS_REM.map((w, i) => (
          <div key={i} className="ftu-pill-skeleton" style={{ width: `${w}rem` }}>
            <Placeholder shape="rectangle" />
          </div>
        ))}
      </div>
    );
  }

  if (categories.length === 0) return null;

  const pills = [
    <Pill
      key="all"
      role="switch"
      size="small"
      text={intl.formatMessage({
        defaultMessage: "All",
        description:
          "First category pill that clears the category filter (shows all tracks).",
      })}
      selected={activeId === null}
      onClick={() => onSelect(null)}
    />,
    ...categories.map((cat) => (
      <Pill
        key={cat.id}
        role="switch"
        size="small"
        text={cat.name}
        maxWidth="25u"
        selected={activeId === cat.id}
        onClick={() => onSelect(activeId === cat.id ? null : cat.id)}
      />
    )),
  ];

  return <Carousel>{pills}</Carousel>;
}
