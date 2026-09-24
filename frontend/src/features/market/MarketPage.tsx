import { useAuth } from "../../auth/AuthProvider";
import { GatePanel } from "../gates/GatePanel";

export function MarketPage() {
  const { status } = useAuth();
  if (status !== "ready") return <GatePanel status={status} />;
  return (
    <section className="gate">
      <h1>Market</h1>
      <p>The market is not part of this layout yet.</p>
    </section>
  );
}
