import type { Metadata } from "next";
import { Box, Mail, MessageCircle, Rotate3d, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Qendra e ndihmës",
  description: "Përgjigje rreth mënyrës si funksionon ROZARIS, zbulimi 3D dhe si të na kontaktoni.",
};

const FAQS = [
  {
    q: "Si funksionon harta 3D?",
    a: "ROZARIS e paraqet Tiranën si një qytet të vërtetë 3D. Rrotullo duke tërhequr, zmadho me scroll ose majë gishtash, dhe anoje për të parë ndërtesat nga një kënd. Ndërsa zmadhon, zonat zbulojnë ndërtesa, listime dhe projekte të reja individuale.",
  },
  {
    q: "Çfarë është \"Shiko në 3D\"?",
    a: "Zhvillimet e reja shfaqin një model 3D të lehtë në hartën kryesore. Duke prekur një projekt hapet një pamje e dedikuar ArchViz në një skedë të re, me modelin e plotë të jashtëm, disponueshmërinë e njësive në kohë reale dhe progresin e ndërtimit.",
  },
  {
    q: "Pse mund të krahasoj vetëm dy prona?",
    a: "Krahasimi është kufizuar qëllimisht në dy artikuj për ta mbajtur përvojën të fokusuar dhe për të ruajtur kontekstin tënd të hartës.",
  },
  {
    q: "Si të kontaktoj një botues?",
    a: "Çdo listim dhe projekt ofron veprime WhatsApp dhe telefoni. ROZARIS nuk lexon përmbajtjen e bisedave të jashtme.",
  },
  {
    q: "Si verifikohen listimet?",
    a: "Çdo listim dhe përditësim i dërguar nga botuesit kërkon miratimin e administratorit përpara se të bëhet publik, dhe çdo listim ka saktësisht një botues për të shmangur dublikatat.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
      <h1 className="text-2xl font-bold text-neutral-900">Qendra e ndihmës</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Përgjigje rreth mënyrës si funksionon ROZARIS. Nuk gjete çfarë kërkoje? Na kontakto më poshtë.
      </p>

      <section id="3d-map" className="mt-8 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Rotate3d className="h-5 w-5 text-brand-500" />
          <h2 className="text-base font-bold text-neutral-900">Eksploro Pronën në 3D</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          ROZARIS është një platformë zbulimi që vendos 3D-në në radhë të parë — harta është
          mënyra kryesore për të shfletuar, jo një widget dytësor pranë një liste. Zhvillimet
          e reja hapin gjithashtu një pamje të dedikuar ArchViz me disponueshmëri në kohë reale
          dhe progres ndërtimi, të cilën zhvilluesit mund ta licencojnë edhe si binjak dixhital
          të integrueshëm për faqet e tyre.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        {FAQS.map((f) => (
          <details key={f.q} className="group rounded-card border border-neutral-200 bg-white p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-900">
              {f.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.a}</p>
          </details>
        ))}
      </section>

      <section id="about" className="mt-10 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          <h2 className="text-base font-bold text-neutral-900">Rreth ROZARIS</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          ROZARIS u mundëson njerëzve të zbulojnë, vlerësojnë dhe kontaktojnë mundësi pasurish
          të paluajtshme përmes një mjedisi 3D të shpejtë, elegant dhe hapësinorisht të saktë —
          duke nisur së pari në Tiranë, Shqipëri, me një arkitekturë gati për t&apos;u zgjeruar
          në Ballkan dhe Evropën më të gjerë.
        </p>
      </section>

      <section id="contact" className="mt-8 rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-bold text-neutral-900">Kontakt</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <a href="mailto:hello@rozaris.al" className="flex items-center gap-2 text-neutral-600 hover:text-brand-600">
            <Mail className="h-4 w-4" /> hello@rozaris.al
          </a>
          <a
            href="https://wa.me/355691234567"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-neutral-600 hover:text-brand-600"
          >
            <MessageCircle className="h-4 w-4" /> Bisedo me mbështetjen në WhatsApp
          </a>
        </div>
      </section>

      <p className="mt-8 flex items-center gap-1.5 text-xs text-neutral-400">
        <Box className="h-3.5 w-3.5" />
        Ky është një prototip produkti — përmbajtja dhe inventari i shfaqur janë ilustrues.
      </p>
    </div>
  );
}
