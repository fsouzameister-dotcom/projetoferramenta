/** Tokens visuais das telas admin escuras (referência: Clientes / PlatformTenants). */

export const adminPageShellClass = (wide = false) =>
  `${wide ? "max-w-6xl" : "max-w-4xl"} mx-auto space-y-6`;

export const adminSectionClass = "rounded-xl border border-zinc-600/60 bg-zinc-800/40 p-6";

export const adminSectionCompactClass = "rounded-xl border border-zinc-600/60 bg-zinc-800/40 p-5";

export const adminPanelClass = "rounded-xl border border-zinc-600/60 bg-zinc-800/40 overflow-hidden";

export const adminInputClass =
  "mt-1.5 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white placeholder:text-gray-500";

export const adminInputInlineClass =
  "rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white text-sm placeholder:text-gray-500";

export const adminSelectClass = adminInputClass;

export const adminLabelClass = "block text-sm text-gray-300";

export const adminLegendClass =
  "text-sm font-semibold text-cyan-200/90 uppercase tracking-wide";

export const adminErrorClass =
  "rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200";

export const adminNoticeClass =
  "rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200";

export const adminCodeClass =
  "text-xs bg-zinc-900 border border-zinc-600 rounded px-2 py-1 break-all text-cyan-100 font-mono";

export const adminPreClass =
  "mt-3 text-xs bg-zinc-900 border border-zinc-600 rounded-lg p-3 overflow-x-auto text-gray-300 font-mono";

export const adminTableHeadClass = "bg-zinc-900/70 text-gray-400 text-left";

export const adminTableRowClass = "border-t border-zinc-700/80";

export const adminBtnPrimaryClass =
  "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark transition-colors disabled:opacity-50";

export const adminBtnSecondaryClass =
  "rounded-lg border border-zinc-600 px-4 py-2 text-sm text-gray-200 hover:bg-zinc-700/50 transition-colors";

export const adminBtnLinkClass = "text-cyan-300 hover:text-cyan-200 hover:underline text-sm";

export const adminBtnDangerClass = "text-red-300 hover:text-red-200 hover:underline text-sm";

export const adminModalOverlayClass =
  "fixed inset-0 z-[75] bg-black/55 flex items-center justify-center p-4";

export const adminModalClass =
  "w-full max-w-md bg-[#111827] border border-[#334155] rounded-xl p-5 shadow-2xl text-gray-100";
