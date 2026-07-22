import {
  MockComposerBar,
  MockUsageFooter,
  MockupsShell,
} from "../MockupsShell";

export default function ChatHeroMock() {
  return (
    <MockupsShell>
      <div className="mx-auto flex max-w-2xl flex-col justify-center py-8 sm:min-h-[60vh]">
        <h2 className="text-center font-serif text-3xl font-medium sm:text-4xl">
          O que você precisa fazer?
        </h2>
        <p className="mt-3 text-center type-body text-muted-foreground">
          Planilha, PDF, análise, código — entregamos pronto.
        </p>
        <div className="mt-8 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-center type-ui text-muted-foreground">
          Ambiente — colapsado · arraste para expandir
        </div>
        <MockComposerBar />
        <MockUsageFooter credits="847 cr restantes" context="12% contexto" />
      </div>
    </MockupsShell>
  );
}
