import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GuidePage, type Toc } from '../components/GuidePage';
import { rise } from '../components/GuideBits';
import { QuickstartSection } from '../sections/github/QuickstartSection';
import { InstallSection } from '../sections/github/InstallSection';
import { ActionSection } from '../sections/github/ActionSection';
import { ProvidersSection } from '../sections/github/ProvidersSection';
import { FixSection } from '../sections/github/FixSection';
import { ReviewSection } from '../sections/github/ReviewSection';
import { SecuritySection } from '../sections/github/SecuritySection';
import { AuditSection } from '../sections/github/AuditSection';
import { HistorySection } from '../sections/github/HistorySection';
import { RoutinesSection } from '../sections/github/RoutinesSection';
import { CiSection } from '../sections/github/CiSection';
import { MentionsSection } from '../sections/github/MentionsSection';
import { HelpSection } from '../sections/github/HelpSection';
import { ScannersSection } from '../sections/github/ScannersSection';
import { ArchitectureSection } from '../sections/github/ArchitectureSection';
import { SkillsSection } from '../sections/github/SkillsSection';
import { ConfigSection } from '../sections/github/ConfigSection';
import { CommandsSection } from '../sections/github/CommandsSection';
import { OrgSection } from '../sections/github/OrgSection';
import { DeploySection } from '../sections/github/DeploySection';
import { GhesSection } from '../sections/github/GhesSection';
import { CostSection } from '../sections/github/CostSection';
import { FaqSection } from '../sections/github/FaqSection';

const TOC: Toc = [
  ['architecture', 'Architecture'],
  ['quickstart', 'Quick start'],
  ['install', 'Install as an App'],
  ['action', 'GitHub Action'],
  ['providers', 'Providers'],
  ['fix', 'Fix an issue'],
  ['review', 'Review a PR'],
  ['security', 'Security'],
  ['scanners', 'Scanners'],
  ['audit', 'Whole-repo audit'],
  ['history', 'Change history'],
  ['routines', 'Routines'],
  ['ci', 'Auto-fix CI'],
  ['mentions', '@mentions'],
  ['help', '/help'],
  ['skills', 'Skills'],
  ['config', 'Configuration'],
  ['commands', 'Commands'],
  ['org', 'Whole-org setup'],
  ['deploy', 'Hosting'],
  ['ghes', 'Enterprise Server'],
  ['cost', 'Cost control'],
  ['faq', 'FAQ'],
];

export function GitHubGuide() {
  return (
    <GuidePage
      toc={TOC}
      eyebrow="Documentation"
      title="Everything Forge does,"
      subtitle="and how to set it up."
      lead="One place for all of it: try it locally in two minutes, generate your workflow file, install it across an organization, and configure exactly what it does. Every capability below lists what starts it, what it produces, and a worked example."
    >
      <ArchitectureSection />
      <QuickstartSection />
      <InstallSection />
      <ActionSection />
      <ProvidersSection />
      <FixSection />
      <ReviewSection />
      <SecuritySection />
      <ScannersSection />
      <AuditSection />
      <HistorySection />
      <RoutinesSection />
      <CiSection />
      <MentionsSection />
      <HelpSection />
      <SkillsSection />
      <ConfigSection />
      <CommandsSection />
      <OrgSection />
      <DeploySection />
      <GhesSection />
      <CostSection />
      <FaqSection />

      <motion.div {...rise} className="flex flex-wrap gap-4 border-t border-white/[0.07] pt-12">
        <Link to="/schedules" className="btn btn-white !rounded-none !uppercase !tracking-[0.14em]">
          Schedules &amp; routines
        </Link>
        <Link to="/examples" className="btn btn-line !rounded-none !uppercase !tracking-[0.14em]">
          See real examples
        </Link>
      </motion.div>
    </GuidePage>
  );
}
