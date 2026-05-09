/**
 * Session-scoped persistence for the Canva app's UI state. Equivalent to the
 * Chrome extension's `chrome.storage.session` — survives across panel
 * close/reopen during the same Canva tab session, but clears when the tab is
 * closed.
 *
 * Each piece of state is stored under its own key for simplicity. All
 * operations are best-effort and silently swallow errors (sessionStorage can
 * throw in private-browsing or certain embedded contexts).
 */

const VIEW_KEY = "ftu_canva_view";
const CAT_ORDER_KEY = "ftu_canva_category_order";
const CAT_SCROLL_KEY = "ftu_canva_category_scroll";

export interface PersistedView {
  /** Currently selected category id (null = "All"). */
  categoryId?: string | null;
  /** Vertical scroll position of the track list. */
  scrollTop?: number;
  /** Number of tracks loaded — used to refetch the same amount on restore. */
  trackCount?: number;
  /** Currently shown related-tracks-for trackId (null = not in related view). */
  relatedToId?: string | null;
  /** The view the user was on before entering related — restored on Back. */
  previousCategoryId?: string | null;
  previousScrollTop?: number;
  previousTrackCount?: number;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadView(): PersistedView {
  try {
    return safeParse<PersistedView>(sessionStorage.getItem(VIEW_KEY), {});
  } catch {
    return {};
  }
}

export function persistView(patch: Partial<PersistedView>) {
  try {
    const current = loadView();
    sessionStorage.setItem(VIEW_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // ignore — sessionStorage may be unavailable
  }
}

export function loadCategoryOrder(): string[] | null {
  try {
    return safeParse<string[] | null>(
      sessionStorage.getItem(CAT_ORDER_KEY),
      null,
    );
  } catch {
    return null;
  }
}

export function persistCategoryOrder(ids: string[]) {
  try {
    sessionStorage.setItem(CAT_ORDER_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function loadCategoryScroll(): number {
  try {
    const v = sessionStorage.getItem(CAT_SCROLL_KEY);
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

export function persistCategoryScroll(scrollLeft: number) {
  try {
    sessionStorage.setItem(CAT_SCROLL_KEY, String(scrollLeft));
  } catch {
    // ignore
  }
}
