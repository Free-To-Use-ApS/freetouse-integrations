import { Rows, Title, Text } from "@canva/app-ui-kit";

export function Header() {
  return (
    <Rows spacing="0.5u">
      <Title size="medium">Free To Use Music</Title>
      <Text size="small" tone="tertiary">
        Royalty-free music for your designs
      </Text>
    </Rows>
  );
}
