import { Link, NavLink } from "react-router";

const tab = ({ isActive }: { isActive: boolean }) =>
  `px-1 py-1 underline-offset-[7px] decoration-2 transition-colors ${
    isActive ? "text-ink underline decoration-marigold" : "text-muted hover:text-ink"
  }`;

export function Header() {
  return (
    <header className="sticky top-0 z-[1000] -mx-4 mb-5 border-b border-rule bg-paper/90 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="h-7 w-7 rounded-[9px]" />
          <span className="font-display text-[19px] leading-none">Commute</span>
        </Link>
        <nav className="flex gap-4 text-[15px]">
          <NavLink to="/" end className={tab}>Plan</NavLink>
          <NavLink to="/about" className={tab}>About</NavLink>
        </nav>
      </div>
    </header>
  );
}

export const card = "rounded-2xl border border-rule bg-surface";
