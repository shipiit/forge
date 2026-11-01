import type { WorkflowConfig } from "../generateWorkflow";
import { providerMeta } from "../providers";

interface BuilderGuideProps {
  c: WorkflowConfig;
  /** Whether a .github/agent.yml is generated alongside the workflow. */
  hasAgentYml: boolean;
}

/** Where each generated file goes, numbered for the setup at hand. */
export function BuilderGuide({ c, hasAgentYml }: BuilderGuideProps) {
  const meta = providerMeta(c.provider);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
      <h4 className="text-[13px] font-semibold text-text">
        Where each file goes
      </h4>
      <ol className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-muted">
        <li className="flex gap-2.5">
          <span className="text-white/40">1</span>
          <span>
            Commit the workflow as{" "}
            <code className="text-[rgb(var(--syn-keyword))]">
              .github/workflows/forge.yml
            </code>
            .
          </span>
        </li>
        {hasAgentYml && (
          <li className="flex gap-2.5">
            <span className="text-white/40">2</span>
            <span>
              Commit the routine as{" "}
              <code className="text-[rgb(var(--syn-keyword))]">
                .github/agent.yml
              </code>
              . The workflow says{" "}
              <em className="not-italic text-text">when</em>; the
              routine says{" "}
              <em className="not-italic text-text">what</em>.
            </span>
          </li>
        )}
        <li className="flex gap-2.5">
          <span className="text-white/40">{hasAgentYml ? 3 : 2}</span>
          <span>
            Add your key under{" "}
            <span className="text-text">
              Settings → Secrets and variables → Actions
            </span>{" "}
            {meta.secretInput ? (
              <>
                as{" "}
                <code className="text-[rgb(var(--syn-keyword))]">
                  {c.secretName || "YOUR_SECRET"}
                </code>
                .
              </>
            ) : (
              <>— see the note above for what this provider needs.</>
            )}
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="text-white/40">{hasAgentYml ? 4 : 3}</span>
          <span>
            {c.schedule.trim() ? (
              <>
                Run it on demand from{" "}
                <span className="text-text">
                  Actions → {c.name || "ShipIT Forge"} → Run workflow
                </span>
                , or comment{" "}
                <code className="text-[rgb(var(--syn-keyword))]">
                  /run {c.routineName || "nightly-digest"}
                </code>{" "}
                in any issue or PR. It also fires on its schedule.
              </>
            ) : (
              <>
                Open an issue or a pull request — Forge responds on the
                events you selected. Comment{" "}
                <code className="text-[rgb(var(--syn-keyword))]">
                  /fix
                </code>{" "}
                or{" "}
                <code className="text-[rgb(var(--syn-keyword))]">
                  /review
                </code>{" "}
                to ask for something directly.
              </>
            )}
          </span>
        </li>
      </ol>
    </div>
  );
}
