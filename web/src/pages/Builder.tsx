import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Header, Footer } from "../components/Layout";
import { ScrollProgress } from "../components/ScrollProgress";
import { rise } from "../components/GuideBits";
import { WorkflowBuilder } from "../components/workflow/WorkflowBuilder";

const NOTES: [string, string][] = [
  [
    "Your key never leaves your repo",
    "The form asks for the NAME of a GitHub secret, never the key itself. Nothing you type here is sent anywhere — the file is generated in your browser.",
  ],
  [
    "Everything is optional but the essentials",
    "Required fields are marked. Leave the rest empty and Forge uses its defaults, which are the same defaults the docs describe.",
  ],
  [
    "Edit it directly",
    "Switch the preview to edit mode and change anything by hand. Your edits stick until you reset, so you can fine-tune before downloading.",
  ],
];

export function Builder() {
  return (
    <>
      <ScrollProgress />
      <Header />

      <div className="mx-auto  px-7 pt-14">
        <motion.div {...rise}>
          <span className="eyebrow">Workflow generator</span>
          <h1 className="display mt-6 text-[clamp(40px,6vw,68px)]">
            Answer a few questions.
            <br />
            <span className="dim">Get your workflow file.</span>
          </h1>
          <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-muted">
            Fill in the form and the file writes itself beside you, live. Copy
            it, download it, or edit it by hand first — then commit it as{" "}
            <code className="text-white/80">.github/workflows/forge.yml</code>{" "}
            and add your key as a repository secret.
          </p>
        </motion.div>

        <motion.div {...rise} className="mt-10">
          <WorkflowBuilder />
        </motion.div>

        <motion.div
          {...rise}
          className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3"
        >
          {NOTES.map(([t, d]) => (
            <div key={t} className="bg-[rgb(11_11_14)] p-6">
              <h3 className="text-[15px] font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </motion.div>

        <motion.div
          {...rise}
          className="mt-12 flex flex-wrap gap-4 border-t border-white/[0.07] pt-12"
        >
          <Link
            to="/github"
            className="btn btn-white !rounded-none !uppercase !tracking-[0.14em]"
          >
            Full documentation
          </Link>
          <Link
            to="/github#install"
            className="btn btn-line !rounded-none !uppercase !tracking-[0.14em]"
          >
            Install as a GitHub App
          </Link>
        </motion.div>
      </div>

      <Footer />
    </>
  );
}
