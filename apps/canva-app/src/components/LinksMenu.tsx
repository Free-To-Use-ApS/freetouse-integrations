import { useIntl } from "react-intl";
import {
  FlyoutMenu,
  FlyoutMenuItem,
  MoreHorizontalIcon,
  OpenInNewIcon,
} from "@canva/app-ui-kit";
import { requestOpenExternalUrl } from "@canva/platform";

/**
 * The "..." overflow menu shown to the right of the search field. Groups the
 * external Free To Use links under a single secondary button with a flyout,
 * each item marked as opening externally (OpenInNew icon) — per Canva review.
 */
export function LinksMenu() {
  const intl = useIntl();
  const openLink = (url: string) => requestOpenExternalUrl({ url });
  const externalIcon = () => <OpenInNewIcon />;

  return (
    <FlyoutMenu
      tone="secondary"
      icon={() => <MoreHorizontalIcon />}
      ariaLabel={intl.formatMessage({
        defaultMessage: "More",
        description:
          "Accessible label for the overflow menu button next to the search field.",
      })}
      flyoutPlacement="bottom-end"
    >
      <FlyoutMenuItem
        end={externalIcon}
        onClick={() => openLink("https://freetouse.com/music/plans")}
      >
        {intl.formatMessage({
          defaultMessage: "Free To Use Plans",
          description: "External link to the subscription plans page.",
        })}
      </FlyoutMenuItem>
      <FlyoutMenuItem
        end={externalIcon}
        onClick={() => openLink("https://freetouse.com/usage-policy")}
      >
        {intl.formatMessage({
          defaultMessage: "Usage Policy",
          description: "External link to the usage policy page.",
        })}
      </FlyoutMenuItem>
      <FlyoutMenuItem
        end={externalIcon}
        onClick={() => openLink("https://freetouse.com/faq")}
      >
        {intl.formatMessage({
          defaultMessage: "FAQ",
          description: "External link to the FAQ page.",
        })}
      </FlyoutMenuItem>
      <FlyoutMenuItem
        end={externalIcon}
        onClick={() => openLink("https://freetouse.com/blog")}
      >
        {intl.formatMessage({
          defaultMessage: "Blog",
          description: "External link to the Free To Use blog.",
        })}
      </FlyoutMenuItem>
    </FlyoutMenu>
  );
}
