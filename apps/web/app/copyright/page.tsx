import { brandConfig } from "@lumen/config/brand";
import type { Metadata } from "next";

import { PublicInformationPage } from "@/components/public-information-page";

export const metadata: Metadata = {
  alternates: { canonical: "/copyright" },
  description: `Copyright expectations for using ${brandConfig.name} responsibly.`,
  title: "Copyright",
};

export default function CopyrightPage() {
  return (
    <PublicInformationPage
      currentPath="/copyright"
      eyebrow="Copyright"
      notice={
        <p>
          Public content publishing is not available, so this site does not currently offer a
          content takedown form. A copyright contact has not yet been published and is required
          before public study content is offered.
        </p>
      }
      summary={`${brandConfig.name} respects ownership, attribution, and authorized use.`}
      title="Respect ownership and attribution."
    >
      <section aria-labelledby="copyright-respect" id="responsibility">
        <h2 id="copyright-respect">Use only material you may use</h2>
        <p>
          You are responsible for confirming that you created content, have permission to use it, or
          may use it under an applicable license or legal exception. Owning a textbook, course,
          subscription, or account does not automatically grant permission to republish its
          contents.
        </p>
        <p>
          This service does not scrape other study services, automate third-party logins, or bypass
          access controls. Study-content imports are not currently available.
        </p>
      </section>

      <section aria-labelledby="copyright-ownership" id="ownership">
        <h2 id="copyright-ownership">Ownership and attribution</h2>
        <p>
          People keep the rights they already hold in their original material. Study-set visibility
          and publishing are not available in this beta. Unavailable features do not change who owns
          material or remove attribution and license obligations.
        </p>
      </section>

      <section aria-labelledby="copyright-notice" id="notices">
        <h2 id="copyright-notice">Required notice process</h2>
        <p>
          Before public content is offered, the operator must publish a copyright contact and a
          procedure that asks a good-faith notice to identify:
        </p>
        <ul>
          <li>the copyrighted work claimed to be infringed;</li>
          <li>the exact public URL or content identifier to review;</li>
          <li>the reporting party&apos;s name and a reliable way to respond;</li>
          <li>a statement of good-faith belief that the use is not authorized; and</li>
          <li>a statement that the information is accurate and the sender is authorized to act.</li>
        </ul>
        <p>
          Do not include passwords, authentication links, a learner&apos;s private study history, or
          unrelated personal information in a notice.
        </p>
      </section>

      <section aria-labelledby="copyright-response" id="response">
        <h2 id="copyright-response">Review and counter-notices</h2>
        <p>
          An operator offering public content should preserve the notice, review the identified
          material, take proportionate action, notify the affected account when lawful, and keep an
          auditable record. A person who believes material was removed by mistake must have a
          documented way to submit a counter-notice with the information required in the
          operator&apos;s jurisdiction.
        </p>
        <p>
          Repeat or serious infringement may lead to restricted publishing or account action.
          Fraudulent or abusive notices may also violate the terms. The operator must adapt the
          procedure to applicable law. No designated agent or copyright contact is currently
          published for this private beta.
        </p>
      </section>
    </PublicInformationPage>
  );
}
