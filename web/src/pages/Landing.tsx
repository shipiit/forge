import { Header, Footer } from '../components/Layout';
import { ScrollProgress } from '../components/ScrollProgress';
import { Hero } from '../sections/landing/Hero';
import { StatsStrip } from '../sections/landing/StatsStrip';
import { ReviewEngine } from '../sections/landing/ReviewEngine';
import { ForgeHub } from '../sections/landing/ForgeHub';
import { Comparison } from '../sections/landing/Comparison';
import { WhatWeCheck } from '../sections/landing/WhatWeCheck';
import { DependencyDemo } from '../sections/landing/DependencyDemo';
import { TrustSection } from '../sections/landing/TrustSection';
import { WhatItDoes } from '../sections/landing/WhatItDoes';
import { SkillsStrip } from '../sections/landing/SkillsStrip';
import { Automation } from '../sections/landing/Automation';
import { Economics } from '../sections/landing/Economics';
import { Shipped } from '../sections/landing/Shipped';
import { Pipeline } from '../sections/landing/Pipeline';
import { Principle } from '../sections/landing/Principle';
import { CallToAction } from '../sections/landing/CallToAction';

export function Landing() {
  return (
    <>
      <ScrollProgress />
      <Header onLanding />
      <Hero />
      <StatsStrip />
      <ReviewEngine />
      <ForgeHub />
      <Comparison />
      <WhatWeCheck />
      <DependencyDemo />
      <TrustSection />
      <WhatItDoes />
      <SkillsStrip />
      <Automation />
      <Economics />
      <Shipped />
      <Pipeline />
      <Principle />
      <CallToAction />
      <Footer />
    </>
  );
}
