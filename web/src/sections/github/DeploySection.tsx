import { Cloud } from 'lucide-react';
import { Section } from '../../components/GuideBits';

const GH = 'https://github.com/shipiit/forge/blob/main';
const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

const HOSTS: [string, string, string][] = [
  [
    'Render',
    'Connect the repo and pick Docker. The free tier is enough — the server idles at no cost between events.',
    `${GH}/deploy/RENDER.md`,
  ],
  [
    'Google Cloud Run',
    'One command: ./deploy/cloudrun.sh. Scales to zero, so you pay only while an event is being handled.',
    `${GH}/deploy/DEPLOY.md`,
  ],
  [
    'Any Docker host',
    'Railway, Fly.io, ECS, or a VPS behind nginx. The only requirement is a public HTTPS URL.',
    'https://github.com/shipiit/forge',
  ],
];

export function DeploySection() {
  return (
    <Section
      id="deploy"
      Icon={Cloud}
      eyebrow="Hosting"
      title="Where the App runs"
      lead="Only the GitHub App needs a server — the Action runs in your CI. The server holds no state: no database, no queue, no volume. It verifies the webhook signature, works out what the event means, runs the agent in a temp directory, and deletes it."
    >
      <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
        {HOSTS.map(([t, d, href]) => (
          <div key={t} className="bg-[rgb(11_11_14)] p-6">
            <h3 className="text-lg font-semibold">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
            <a
              href={href}
              {...ext}
              className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.16em] text-muted hover:text-text"
            >
              Guide ↗
            </a>
          </div>
        ))}
      </div>
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
        The full webhook setup — generating the secret, the exact URL, the private key, and developing locally over
        smee — is in the <span className="text-text">Deploy &amp; webhook</span> tab of the App install section
        above.
      </p>
    </Section>
  );
}
