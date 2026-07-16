import { brandConfig } from "@lumen/config/brand";
import type { Metadata } from "next";

import { PublicInformationPage } from "@/components/public-information-page";

export const metadata: Metadata = {
  alternates: { canonical: "/copyright" },
  description: `Copyright expectations and future notice process for content on ${brandConfig.name}.`,
  title: "Copyright",
};

export default function CopyrightPage() {
  return (
    <PublicInformationPage
      currentPath="/copyright"
      eyebrow="Copyright"
      notice={
        <p>
          Public content publishing is not enabled in the current identity phase, so there is no
          live takedown form to imply otherwise. The deployment owner must publish a valid notice
          channel before public study content launches.
        </p>
      }
      summary={`${brandConfig.name} is being built for portable, attributed study materials—not for copying work without permission.`}
      title="Create, import, and share responsibly."
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
          The platform must not scrape other study services, automate third-party logins, or bypass
          access controls. Imports are limited to user-provided authorized exports, pasted text,
          files, and documented APIs when those features are implemented.
        </p>
      </section>

      <section aria-labelledby="copyright-ownership" id="ownership">
        <h2 id="copyright-ownership">Ownership and attribution</h2>
        <p>
          People keep the rights they already hold in their original material. A future visibility
          setting will control whether a study set is private, shared, unlisted, or public; it will
          not change who owns the work. Attribution and license information must travel with public
          projections and portable exports when supplied.
        </p>
      </section>

      <section aria-labelledby="copyright-notice" id="notices">
        <h2 id="copyright-notice">What a copyright notice should include</h2>
        <p>When the operator activates a notice channel, a good-faith notice should identify:</p>
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
          A production operator should preserve the notice, review the identified material, take
          proportionate action, notify the affected account when lawful, and keep an auditable
          record. A person who believes material was removed by mistake must have a documented way
          to submit a counter-notice with the information required in the operator&apos;s
          jurisdiction.
        </p>
        <p>
          Repeat or serious infringement may lead to restricted publishing or account action.
          Fraudulent or abusive notices may also violate the terms. The operator must adapt the
          procedure to applicable law and name the correct designated agent or contact before
          launch; this page does not invent one.
        </p>
      </section>
    </PublicInformationPage>
  );
}
