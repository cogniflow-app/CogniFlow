import { brandConfig } from "@lumen/config/brand";
import type { Metadata } from "next";

import { PublicInformationPage } from "@/components/public-information-page";

export const metadata: Metadata = {
  alternates: { canonical: "/safety" },
  description: `Safety boundaries for accounts, learner profiles, and room-code guest access on ${brandConfig.name}.`,
  title: "Safety",
};

export default function SafetyPage() {
  return (
    <PublicInformationPage
      currentPath="/safety"
      eyebrow="Safety center"
      notice={
        <p>
          This beta does not publish study sets or provide open chat, direct messages, or public
          live game rooms.
        </p>
      }
      summary={`Safety on ${brandConfig.name} begins with clear learner boundaries, minimal data, and protected account access.`}
      title="Learning should feel focused, not exposed."
    >
      <section aria-labelledby="safety-now" id="protections">
        <h2 id="safety-now">Account protections</h2>
        <ul>
          <li>Age bands are used instead of collecting exact birthdays by default.</li>
          <li>Under-13 accounts and child profiles are unavailable in this beta.</li>
          <li>
            Profile PINs, guest reconnect tokens, and profile-session tokens are stored as hashes.
          </li>
          <li>
            Sensitive actions use server authorization, rate limits, re-authentication, and audit
            events.
          </li>
          <li>Appearance controls include reduced motion and a low-stimulation serious mode.</li>
        </ul>
      </section>

      <section aria-labelledby="safety-children" id="child-safety">
        <h2 id="safety-children">Child-profile boundaries</h2>
        <p>
          The service does not currently create child accounts or guardian-managed child profiles.
          It does not provide unrestricted child chat, direct messages, public child biographies,
          external links, or child global leaderboards.
        </p>
        <p>
          This private beta is for people age 13 or older. Child profiles cannot be enabled until
          appropriate identity, consent, privacy, retention, incident-response, provider, and legal
          safeguards are complete.
        </p>
      </section>

      <section aria-labelledby="safety-guests" id="game-guests">
        <h2 id="safety-guests">Game guests and nicknames</h2>
        <p>
          The room-code flow requires a valid, active room before it creates temporary guest access.
          Guest identities use filtered or generated nicknames, short expirations, hashed reconnect
          tokens, and rate limits without invasive fingerprinting. Guests do not gain persistent XP
          or become searchable profiles.
        </p>
        <p>
          Public live game rooms are not available in this beta. A code for a missing, closed, or
          guest-restricted room is rejected.
        </p>
      </section>

      <section aria-labelledby="safety-actions" id="what-to-do">
        <h2 id="safety-actions">If something feels unsafe</h2>
        <ol>
          <li>
            Leave the page, room, or shared device if remaining there could put someone at risk.
          </li>
          <li>
            Tell a trusted adult, guardian, teacher, or event host when a learner is involved.
          </li>
          <li>
            Revoke an unfamiliar device or session from account settings and change the password.
          </li>
          <li>
            Use the operator&apos;s reporting channel when one is published; never include a
            password, PIN, or recovery link.
          </li>
        </ol>
        <p>
          If anyone is in immediate danger, contact local emergency services. This site is not an
          emergency service. A staffed safety and security contact has not yet been published and is
          required before public content or live rooms are offered.
        </p>
      </section>

      <section aria-labelledby="safety-privacy" id="privacy-and-wellbeing">
        <h2 id="safety-privacy">Privacy and wellbeing</h2>
        <p>
          Do not place private contact details, school locations, passwords, health information, or
          other sensitive data in a display name, handle, nickname, or shared content. Learners
          should use real breaks, accessible settings, and serious mode whenever motion,
          competition, or visual density makes study harder rather than better.
        </p>
      </section>
    </PublicInformationPage>
  );
}
