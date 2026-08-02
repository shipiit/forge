import { Workflow } from 'lucide-react';
import { Section } from '../../components/GuideBits';
import { ActionReference } from '../../components/ActionReference';

const NOTES: [string, string][] = [
  [
    'Action or App?',
    'The Action is per-repository with no infrastructure. The App installs once org-wide but needs a server you host. Both run the same engine and behave identically.',
  ],
  [
    'Put the key in an org secret',
    'One organization secret, and the same workflow file drops into every repository unchanged — ship it from your .github template repo.',
  ],
  [
    'Watch the permissions',
    'contents, pull-requests, and issues write is the minimum. Add checks: write for the review check run, and id-token: write only if you use cloud OIDC.',
  ],
];

export function ActionSection() {
  return (
    <Section
      id="action"
      Icon={Workflow}
      eyebrow="GitHub Action"
      title="Every input, and what it controls"
      lead="The Action needs no server — it runs inside your own CI on your own key. Every input below is optional: with none of them set the behaviour is the default, so adding any of this can never change how an existing workflow runs."
    >
      <ActionReference />
      <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
        {NOTES.map(([t, d]) => (
          <div key={t} className="bg-[rgb(11_11_14)] p-6">
            <h4 className="text-[15px] font-semibold">{t}</h4>
            <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
