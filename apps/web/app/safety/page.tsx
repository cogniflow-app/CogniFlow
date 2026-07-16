import { brandConfig } from "@lumen/config/brand";
import type { Metadata } from "next";

import { PublicInformationPage } from "@/components/public-information-page";

export const metadata: Metadata = {
  alternates: { canonical: "/safety" },
  description: `Safety boundaries for accounts, learner profiles, and future game guests on ${brandConfig.name}.`,
  title: "Safety",
};

export default function SafetyPage() {
  return (
    <PublicInformationPage
      currentPath="/safety"
      eyebrow="Safety center"
      notice={
        <p>
          The current phase has no public study-set publishing, open chat, direct messages, or live
          game rooms. Those surfaces must pass their own moderation and child-safety gates before
          they are enabled.
        </p>
      }
      summary={`Safety on ${brandConfig.name} begins with clear learner boundaries, minimal data, and server-enforced permissions.`}
      title="Learning should feel focused, not exposed."
    >
      <section aria-labelledby="safety-now" id="protections">
        <h2 id="safety-now">Protections built into the account foundation</h2>
        <ul>
          <li>Age bands are used instead of collecting exact birthdays by default.</li>
          <li>Under-13 learners cannot create independent accounts.</li>
          <li>
            Child access is guardian-scoped, explicit, time-limited where appropriate, and
            revocable.
          </li>
          <li>Profile PINs, reconnect credentials, and session tokens are stored as hashes.</li>
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
          Child profiles have no child email requirement and cannot access the guardian&apos;s
          email, provider connections, devices, privacy requests, or other account administration.
          The product does not provide unrestricted child chat, direct messages, public child
          biographies, external links, or child global leaderboards.
        </p>
        <p>
          Child profiles stay disabled in every production runtime—even if a browser request or
          environment value tampers with a feature flag. Re-enabling them requires an independent,
          opaque child-facing identity plus the provider, consent, privacy, retention, incident
          response, and legal launch gates. Portability alone is not permission to launch.
        </p>
      </section>

      <section aria-labelledby="safety-guests" id="game-guests">
        <h2 id="safety-guests">Game guests and nicknames</h2>
        <p>
          When live games are introduced, joining without an account will require a valid room code.
          Guest records will use filtered or generated nicknames, short expirations, hashed
          reconnect tokens, and rate limits without invasive fingerprinting. Guests will not gain
          persistent XP or become searchable profiles.
        </p>
        <p>
          The current join surface validates readiness and does not pretend that a nonexistent room
          is available. Future hosts must receive moderation controls before public game rooms are
          enabled.
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
            Use the reporting channel published by the deployment operator; never include a
            password, PIN, or recovery link.
          </li>
        </ol>
        <p>
          If anyone is in immediate danger, contact local emergency services. This site is not an
          emergency service. A production operator must publish a staffed safety and security
          contact before enabling public content or live rooms.
        </p>
      </section>

      <section aria-labelledby="safety-privacy" id="privacy-and-wellbeing">
        <h2 id="safety-privacy">Privacy and wellbeing</h2>
        <p>
          Do not place private contact details, school locations, passwords, health information, or
          other sensitive data in a display name, handle, nickname, or future shared study content.
          Learners should use real breaks, accessible settings, and serious mode whenever motion,
          competition, or visual density makes study harder rather than better.
        </p>
      </section>
    </PublicInformationPage>
  );
}
