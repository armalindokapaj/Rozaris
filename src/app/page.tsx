import { LandingHero } from "@/components/landing/LandingHero";

// Deliberately outside the (site) route group — PRD_ROZARIS_Landing.pdf
// requires no shared nav/header chrome on this route at all (see the
// rozaris-landing-page-prd memory), the same reason /project/[slug] also
// sits outside (site). Metadata is inherited from the root layout's
// default (no override needed here).

export default function LandingPage() {
  return <LandingHero />;
}
