import { Hero } from "./sections/Hero";
import { QuantumRisk } from "./sections/QuantumRisk";
import { SmartAccounts } from "./sections/SmartAccounts";
import { Network } from "./sections/Network";
import { Persona } from "./sections/Persona";
import { Roadmap } from "./sections/Roadmap";
import { RunIt } from "./sections/RunIt";
import { FAQ } from "./sections/FAQ";
import { CTA } from "./sections/CTA";

export default function Page() {
  return (
    <>
      <Hero />
      <QuantumRisk />
      <SmartAccounts />
      <Network />
      <Persona />
      <Roadmap />
      <RunIt />
      <FAQ />
      <CTA />
    </>
  );
}
