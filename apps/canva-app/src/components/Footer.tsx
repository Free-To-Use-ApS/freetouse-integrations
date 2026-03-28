import { Rows, Text, Button } from "@canva/app-ui-kit";
import { requestOpenExternalUrl } from "@canva/platform";

export function Footer() {
  const handleLink = async (url: string) => {
    await requestOpenExternalUrl({ url });
  };

  return (
    <Rows spacing="0.5u">
      <Text size="small" tone="tertiary" alignment="center">
        Free for personal use.
      </Text>
      <Button
        variant="tertiary"
        onClick={() => handleLink("https://freetouse.com/music/plans")}
        stretch
      >
        Get a license for commercial use
      </Button>
    </Rows>
  );
}
