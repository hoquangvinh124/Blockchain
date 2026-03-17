import { Link, useLocation } from "react-router-dom";
import { Compass, Layers, Images, Gavel, UserCircle, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/app/explore", label: "Explore", icon: Compass },
  { href: "/app/collections", label: "Collections", icon: Layers },
  { href: "/app/nfts", label: "NFTs", icon: Images },
  { href: "/app/jury", label: "Jury", icon: Gavel },
];

const BOTTOM_LINKS = [
  { href: "/app/profile", label: "Profile", icon: UserCircle, isParent: true },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <div className="fixed left-0 top-0 z-50 h-screen w-16 flex flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-300 hover:w-64 group">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-zinc-800 px-4">
        <Link to="/" className="flex items-center gap-3 overflow-hidden">
          <img src="/images/logo.png" alt="Logo" className="size-10 shrink-0 object-contain" />
          <span className="font-sans text-xl font-bold tracking-tight text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            AtsttMarket
          </span>
        </Link>
      </div>

      {/* Main Links */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-thin scrollbar-thumb-zinc-800">
        <ul className="flex flex-col gap-1 px-2">
          {NAV_LINKS.map((link) => {
            const isActive = location.pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  to={link.href}
                  className={cn(
                    "group/item flex items-center gap-3 rounded-xl py-1 px-1 text-sm font-semibold transition-all duration-200",
                    isActive ? "text-white" : "text-zinc-400 hover:text-white"
                  )}
                >
                  <span className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                    isActive ? "bg-zinc-800" : "group-hover/item:bg-zinc-800/80"
                  )}>
                    <link.icon className="size-4" />
                  </span>
                  <span className="whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    {link.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Create Button */}
      <div className="px-2 pb-2">
        <Link
          to="/app/create"
          className={cn(
            "group/item flex items-center gap-3 rounded-xl py-1 px-1 text-sm font-semibold transition-all duration-200",
            location.pathname === "/app/create" ? "text-white" : "text-blue-400 hover:text-white"
          )}
        >
          <span className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
            location.pathname === "/app/create"
              ? "bg-blue-600 shadow-lg shadow-blue-600/20"
              : "bg-blue-600/10 group-hover/item:bg-blue-600 group-hover/item:shadow-lg group-hover/item:shadow-blue-600/20"
          )}>
            <PlusCircle className="size-4" />
          </span>
          <span className="whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            Create
          </span>
        </Link>
      </div>

      {/* Bottom Links */}
      <div className="border-t border-zinc-800 py-4">
        <ul className="flex flex-col gap-1 px-2">
          {BOTTOM_LINKS.map((link) => {
            const isActive = location.pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  to={link.href}
                  className={cn(
                    "group/item flex items-center gap-3 rounded-xl py-1 px-1 text-sm font-semibold transition-all duration-200",
                    isActive ? "text-white" : "text-zinc-400 hover:text-white"
                  )}
                >
                  <span className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                    isActive ? "bg-zinc-800" : "group-hover/item:bg-zinc-800/80"
                  )}>
                    <link.icon className="size-4" />
                  </span>
                  <span className="flex-1 whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-center justify-between">
                    {link.label}
                    {link.isParent && <span className="text-xs">❯</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
