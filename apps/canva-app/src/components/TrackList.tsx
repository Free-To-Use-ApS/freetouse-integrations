import { useEffect } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  Box,
  Button,
  Column,
  Columns,
  Placeholder,
  Rows,
  Text,
  TextPlaceholder,
  Title,
  TitlePlaceholder,
} from "@canva/app-ui-kit";
import type { Track } from "@freetouse/api";
import { TrackItem } from "./TrackItem";
import { useNowPlayingControls } from "../hooks/useNowPlaying";

function SkeletonRow() {
  return (
    <Columns spacing="1u" alignY="center">
      <Column width="content">
        <div className="ftu-cover-skeleton">
          <Placeholder shape="square" />
        </div>
      </Column>
      <Column width="fluid">
        <Rows spacing="0.5u">
          <TitlePlaceholder size="small" />
          <TextPlaceholder size="xsmall" />
        </Rows>
      </Column>
    </Columns>
  );
}

function SkeletonList({ count = 12 }: { count?: number }) {
  const intl = useIntl();
  return (
    <div
      aria-busy="true"
      aria-label={intl.formatMessage({
        defaultMessage: "Loading tracks",
        description:
          "Accessible label shown while the list of music tracks is loading.",
      })}
    >
      <Rows spacing="2u">
        {Array.from({ length: count }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </Rows>
    </div>
  );
}

interface TrackListProps {
  tracks: Track[];
  query: string;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onFindSimilar: (trackId: string) => void;
}

export function TrackList({
  tracks,
  query,
  loading,
  hasMore,
  onLoadMore,
  onFindSimilar,
}: TrackListProps) {
  const intl = useIntl();
  const { setQueue } = useNowPlayingControls();

  // Keep the autoplay queue in sync with the visible track list.
  useEffect(() => {
    setQueue(tracks);
  }, [tracks, setQueue]);

  if (tracks.length === 0 && loading) {
    return <SkeletonList />;
  }

  if (tracks.length === 0) {
    return (
      <Box paddingY="4u" paddingX="2u">
        <Rows spacing="1u" align="center">
          <Title size="small" alignment="center">
            <FormattedMessage
              defaultMessage="No results found"
              description="Empty-state headline when a search or category returns no tracks."
            />
          </Title>
          <Text size="small" tone="secondary" alignment="center">
            {query ? (
              <FormattedMessage
                defaultMessage="No results found for ‘{query}’. Try searching for a different term."
                description="Empty-state body shown with the user's search term."
                values={{ query }}
              />
            ) : (
              <FormattedMessage
                defaultMessage="Try a different category or search term."
                description="Empty-state body shown when no search term is present."
              />
            )}
          </Text>
        </Rows>
      </Box>
    );
  }

  return (
    <Rows spacing="2u">
      <Rows spacing="1u">
        {tracks.map((track) => (
          <TrackItem
            key={track.id}
            track={track}
            onFindSimilar={onFindSimilar}
          />
        ))}
      </Rows>

      {hasMore && (
        <Button
          variant="secondary"
          stretch
          loading={loading}
          disabled={loading}
          onClick={onLoadMore}
        >
          {intl.formatMessage({
            defaultMessage: "Load more",
            description: "Label on the button that loads the next page of tracks.",
          })}
        </Button>
      )}
    </Rows>
  );
}
