import type { Metadata } from "next";

import { ContentPage } from "@/components/layout/content-page";
import { ContactForm } from "@/components/layout/contact-form";

export const metadata: Metadata = {
  title: "Contact Us | Phoenix Voyages",
  description:
    "Get in touch with Phoenix Voyages. Our travel advisors are ready to help you plan your next luxury cruise, group trip, or destination wedding.",
};

export default function ContactPage() {
  return (
    <ContentPage title="Contact Us">
      <p className="text-muted-foreground">
        Have a question or ready to start planning? Fill out the form below and one of our
        Travel Advisors will be in touch within one business day.
      </p>
      <ContactForm />
    </ContentPage>
  );
}
