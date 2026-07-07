// Escotilha interna de curadoria.
//
// Quando `?full=1` está na URL, revela a camada TÉCNICA/ADMIN (o mesmo gate já
// usado por Config ConfigUser↔ConfigPage e por Skills featured↔biblioteca).
// As telas "split" usam isto para ESCONDER o encanamento do usuário-final e
// manter só o núcleo de produto — sem apagar nada: com ?full=1 (nós/suporte)
// tudo volta a aparecer.
export function isInternalView(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("full") === "1";
  } catch {
    return false;
  }
}
