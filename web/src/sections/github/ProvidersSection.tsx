import { Cpu } from 'lucide-react';
import { Section } from '../../components/GuideBits';
import { ProviderTabs } from '../../components/ProviderTabs';

export function ProvidersSection() {
  return (
    <Section
      id="providers"
      Icon={Cpu}
      eyebrow="Bring your own model"
      title="Nine providers, one contract"
      lead="Pick a provider and paste one key. The agent behaves identically behind all of them — the adapters normalize messages, tools, images, and token accounting so nothing else in the system knows which model is answering."
    >
      <ProviderTabs />
    </Section>
  );
}
