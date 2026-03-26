import type { Metadata } from "next";

import { ContentPage } from "@/components/layout/content-page";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Privacy Policy | Phoenix Voyages",
  description: "Privacy Policy for Phoenix Voyages — how we collect, use, and protect your information.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-base font-bold tracking-wide text-[#1A1A1A] md:text-lg">
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy Policy">
      <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This is placeholder content. Full policy pending legal review.
      </p>

      <Separator />

      <Section title="Information We Collect">
        <p>
          We collect information you provide directly to us, such as your name, email address,
          phone number, passport details, and payment information when you make a booking or
          inquiry. We also collect information automatically when you use our website,
          including IP address, browser type, pages visited, and referring URLs.
        </p>
      </Section>

      <Separator />

      <Section title="How We Use Your Information">
        <p>
          We use the information we collect to process bookings and payments, communicate with
          you about your travel arrangements, send promotional offers and newsletters (with
          your consent), improve our website and services, and comply with legal and regulatory
          obligations under TICO and PIPEDA.
        </p>
        <p>
          We will never sell your personal information to third parties. We share information
          only with the travel suppliers necessary to complete your booking, and with service
          providers who assist us in operating our business under strict confidentiality
          agreements.
        </p>
      </Section>

      <Separator />

      <Section title="Cookies">
        <p>
          Our website uses cookies and similar tracking technologies to enhance your browsing
          experience, analyze site traffic, and personalize content. You may disable cookies
          through your browser settings, though some features of the site may not function
          correctly as a result.
        </p>
      </Section>

      <Separator />

      <Section title="Third-Party Services">
        <p>
          Our website may contain links to third-party websites, including travel supplier
          portals and payment processors. This Privacy Policy does not apply to those sites.
          We encourage you to review the privacy policies of any third-party services you
          access through our platform.
        </p>
      </Section>

      <Separator />

      <Section title="Your Rights">
        <p>
          Under applicable Canadian privacy law (PIPEDA), you have the right to access,
          correct, or request deletion of the personal information we hold about you. To
          exercise these rights, please contact us at the address below. We will respond to
          all requests within 30 days.
        </p>
      </Section>

      <Separator />

      <Section title="Contact">
        <p>
          For privacy-related inquiries or to exercise your rights, please contact Phoenix
          Voyages at{" "}
          <a
            href="mailto:privacy@phoenixvoyages.ca"
            className="font-medium text-[#C59746] underline-offset-4 hover:underline"
          >
            privacy@phoenixvoyages.ca
          </a>
          .
        </p>
      </Section>
    </ContentPage>
  );
}
