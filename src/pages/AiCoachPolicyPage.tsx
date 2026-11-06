import { CoachPolicyDisclosure } from "../features/coach/CoachPolicyDisclosure";
import { publicCoachPolicy } from "../features/coach/publicCoachPolicy";
import { Card, Text } from "../theme/components";

export default function AiCoachPolicyPage() {
  const policy = publicCoachPolicy();
  return (
    <main style={{ maxWidth: "var(--content-narrow)", margin: "0 auto", padding: "var(--space-6) var(--space-4)" }}>
      <Text as="h1" variant="title">{policy.title}</Text>
      <Card style={{ marginTop: "var(--space-4)" }}><CoachPolicyDisclosure policy={policy} /></Card>
    </main>
  );
}
