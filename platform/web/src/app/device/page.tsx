import Image from "next/image";

/** Desktop login hand-off — session is set; the app polls /device/engine-key. */
export default function DeviceLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      <Image
        src="/brand/work4you-logo.png"
        alt="Work4You"
        width={240}
        height={244}
        priority
        className="h-[70px] w-auto"
      />
      <h1 className="mt-10 text-xl font-semibold tracking-tight">Sessão iniciada</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
        Pode fechar esta janela e voltar à app Work4You. A ligação conclui-se automaticamente.
      </p>
    </main>
  );
}