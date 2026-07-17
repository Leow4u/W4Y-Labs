/**
 * SkillMarketplace — the USER's view of Skills (Leonardo's decision 10/07):
 * a browsable marketplace of the OFFICIAL catalog (the 102 local optional-skills),
 * by CATEGORY + filter + search, with Instalar/Instalado. ORIGINAL names and
 * descriptions (no translation/friendly label — only the chrome is i18n).
 *
 * The 72 active ("system") skills do NOT show up here and cannot be disabled
 * by the user — they live at ?full=1 (us). Data+action live in the shared
 * useSkillHub hook (also used by PluginsHub); the card is the SkillHubCard.
 */
import { useState } from "react";
import { Search } from "lucide-react";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Input } from "@nous-research/ui/ui/components/input";
import type { SkillHubResult } from "@/lib/api";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { useSkillHub, filterSkills } from "@/hooks/useSkillHub";
import { SkillHubCard, prettyCat } from "@/components/skills/SkillHubCard";
import { SkillDetailModal } from "@/components/SkillDetailModal";

export function SkillMarketplace({ profile }: { profile?: string }) {
  const { t } = useI18n();
  const { skills, installed, loading, busy, failed, install, categories } = useSkillHub(profile);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  // Card body click → read the skill (hub preview) before installing.
  const [detail, setDetail] = useState<SkillHubResult | null>(null);

  const shown = filterSkills(skills, search, activeCat);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bar: categories (left) + search (right). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <Chip
            label={`${t.configUser.skAll} (${skills.length})`}
            active={!activeCat}
            onClick={() => setActiveCat(null)}
          />
          {categories.map(([c, n]) => (
            <Chip
              key={c}
              label={`${prettyCat(c, t.common.general)} (${n})`}
              active={activeCat === c}
              onClick={() => setActiveCat(activeCat === c ? null : c)}
            />
          ))}
        </div>
        <div className="relative w-44 shrink-0 sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder={t.configUser.skBrowse}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Card grid (ORIGINAL names). */}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          {t.skills.noSkillsMatch}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((r) => (
            <SkillHubCard
              key={r.identifier}
              skill={r}
              installed={Boolean(installed[r.identifier])}
              installing={busy[r.identifier] === "install"}
              failed={failed[r.identifier]}
              onInstall={install}
              onOpen={setDetail}
            />
          ))}
        </div>
      )}

      {/* Read the real SKILL.md (hub preview) before installing. */}
      <SkillDetailModal
        open={detail != null}
        skillName={detail?.name ?? null}
        onClose={() => setDetail(null)}
        hub={
          detail
            ? {
                skill: detail,
                installed: Boolean(installed[detail.identifier]),
                installing: busy[detail.identifier] === "install",
                failed: failed[detail.identifier],
                onInstall: install,
                profile,
              }
            : undefined
        }
      />
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground/90 text-background"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
