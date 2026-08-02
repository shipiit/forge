import { Github } from 'lucide-react';
import { Section } from '../../components/GuideBits';
import { AppInstall } from '../../components/AppInstall';

export function InstallSection() {
  return (
    <Section
      id="install"
      Icon={Github}
      eyebrow="Install"
      title="Set it up as a GitHub App"
      lead="Install once on your organization and every selected repository is covered — no per-repo file to commit. The moment you approve the permissions, every capability on this page starts running automatically on its matching event. There is nothing else to switch on."
    >
      <AppInstall />
    </Section>
  );
}
