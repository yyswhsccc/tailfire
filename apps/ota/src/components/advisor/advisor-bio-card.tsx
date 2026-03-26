import type { AdvisorProfile } from "@/types/advisor";

interface AdvisorBioCardProps {
  advisor: AdvisorProfile;
}

export function AdvisorBioCard({ advisor }: AdvisorBioCardProps) {
  const firstName = advisor.displayName.split(" ")[0];
  const hasBio = advisor.bio || advisor.bioSupplement;
  const hasCertifications =
    advisor.certifications && advisor.certifications.length > 0;

  if (!hasBio && !hasCertifications) return null;

  return (
    <section className="px-4 pb-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl rounded-xl bg-[#faf6f0] p-6 sm:p-8">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#1A1A1A]">
          About {firstName}
        </h2>

        {advisor.bio && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {advisor.bio}
          </p>
        )}

        {advisor.bioSupplement && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {advisor.bioSupplement}
          </p>
        )}

        {hasCertifications && (
          <div className="mt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">
              Certifications
            </h3>
            <ul className="mt-2 space-y-1">
              {advisor.certifications!.map((cert) => (
                <li
                  key={cert}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-[#C59746]" />
                  {cert}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
