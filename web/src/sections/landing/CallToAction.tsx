import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { GITHUB, rise } from './motion';

export function CallToAction() {
  return (
    <section className="border-t border-white/[0.07] px-7 py-28 text-center">
      <motion.div {...rise} className="mx-auto max-w-3xl">
        <h2 className="display text-[clamp(36px,5.5vw,68px)]">Write the issue.<br /><span className="dim">Forge ships the fix.</span></h2>
        <div className="mt-9 flex flex-wrap justify-center gap-5">
          <Link to="/github" className="btn btn-ember">Read the docs <ArrowRight size={15} /></Link>
          <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="btn btn-line !rounded-none !uppercase !tracking-[0.14em]">Get it on GitHub</a>
        </div>
      </motion.div>
    </section>
  );
}
