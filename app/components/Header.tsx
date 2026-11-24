import { Link, NavLink } from "react-router";

const tab = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 transition ${
    isActive ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
  }`;

export function Header() {
  return (
    <header className="sticky top-0 z-[1000] -mx-4 mb-4 border-b border-zinc-200/80 bg-stone-50/85 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/85">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-7 w-7 rounded-lg" />
          <span className="text-[15px] font-semibold tracking-tight">Commute</span>
        </Link>
        <nav className="flex gap-1 text-[13px] font-medium">
          <NavLink to="/" end className={tab}>Plan</NavLink>
          <NavLink to="/metro" className={tab}>Metro</NavLink>
          <NavLink to="/about" className={tab}>About</NavLink>
        </nav>
      </div>
    </header>
  );
}

export const card = "rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900";
