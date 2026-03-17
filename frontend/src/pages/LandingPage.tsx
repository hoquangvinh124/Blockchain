import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, ShieldAlert, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/MetricCard";

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-24 py-8">
      {/* Hero Section */}
      <section className="relative flex flex-col items-center text-center">
        {/* Abstract glowing element */}
        <div className="absolute top-1/2 left-1/2 -z-10 h-[300px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-[var(--color-accent)] opacity-20 blur-[100px]" />

        <div className="mb-6 flex items-center gap-2 rounded-full border border-[var(--color-border-default)] bg-[var(--color-surface-hover)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-widest backdrop-blur-md">
          <span className="size-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
          Composable Escrow Protocol
        </div>

        <h1 className="max-w-4xl text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
          The marketplace where <br className="hidden sm:block" />
          <span className="bg-gradient-to-r from-[var(--color-accent)] to-[#dab891] bg-clip-text text-transparent">
            trust is onchain
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-[var(--color-text-secondary)]">
          List items, escrow payments, resolve disputes through decentralized jury voting &mdash; all transparent, all verifiable, all upgradeable. Built for teams that ship.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link to="/app/explore">
            <Button size="lg" className="h-12 px-8 text-sm font-semibold tracking-wide">
              Enter Marketplace <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
          <Link to="/app/jury">
            <Button size="lg" variant="outline" className="h-12 px-8 text-sm tracking-wide">
              Explore Jury Portal
            </Button>
          </Link>
        </div>
      </section>

      {/* Protocol Diagram / Metrics */}
      <section className="mx-auto w-full max-w-5xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard 
            label="Core Contracts" 
            value="4" 
            note="Collection · Escrow · Jury · Trust" 
            accent
          />
          <MetricCard 
            label="Voting Model" 
            value="Commit-Reveal" 
            note="Anti-herd behavior" 
          />
          <MetricCard 
            label="State Machine" 
            value="9 Statuses" 
            note="Active to Cancelled" 
          />
          <MetricCard 
            label="Architecture" 
            value="UUPS Proxy" 
            note="Upgradeable via OpenZeppelin" 
          />
        </div>
      </section>

      {/* Features Grid */}
      <section className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-3">
        <div className="feature-card p-6 rounded-2xl border border-[var(--color-border-dim)] bg-[var(--color-surface-0)] relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface-hover)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <ShieldCheck className="mb-4 size-8 text-[var(--color-accent)]" />
          <h3 className="mb-2 text-lg font-bold text-[var(--color-text-primary)]">Smart Escrow</h3>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            Funds are locked programmatically. Sellers must deposit collateral to list items, ensuring skin in the game. Buyers release funds only upon delivery.
          </p>
        </div>
        
        <div className="feature-card p-6 rounded-2xl border border-[var(--color-border-dim)] bg-[var(--color-surface-0)] relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface-hover)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <Cpu className="mb-4 size-8 text-blue-400" />
          <h3 className="mb-2 text-lg font-bold text-[var(--color-text-primary)]">ERC-1155 Collections</h3>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            Every collection uses ERC-1155 tokens representing digital or physical goods. Normal tokens trade instantly; Phygital tokens bridge on-chain ownership with real-world delivery.
          </p>
        </div>

        <div className="feature-card p-6 rounded-2xl border border-[var(--color-border-dim)] bg-[var(--color-surface-0)] relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface-hover)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <ShieldAlert className="mb-4 size-8 text-rose-400" />
          <h3 className="mb-2 text-lg font-bold text-[var(--color-text-primary)]">Dispute DAO</h3>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            Conflicts are escalated to JuryDAO. Registered jurors use a cryptographic commit-reveal scheme to securely vote without being influenced by early voters.
          </p>
        </div>
      </section>
      
      {/* Architecture Terminal Block */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-12">
        <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[#0C1215]">
          <div className="flex items-center gap-2 border-b border-[var(--color-border-dim)] bg-[#111A1F] px-4 py-3">
            <div className="size-3 rounded-full bg-rose-500/80" />
            <div className="size-3 rounded-full bg-amber-500/80" />
            <div className="size-3 rounded-full bg-emerald-500/80" />
            <span className="ml-2 font-mono text-[0.6875rem] font-medium text-[var(--color-text-tertiary)]">hardhat node</span>
          </div>
          <div className="p-6 font-mono text-sm leading-relaxed text-[#A4B1CD]">
            <p><span className="text-emerald-400">$</span> npx hardhat compile</p>
            <p className="mt-2 opacity-60">Compiled 8 Solidity files successfully</p>
            
            <p className="mt-4"><span className="text-emerald-400">$</span> npx hardhat run scripts/deploy.ts --network localhost</p>
            <p className="mt-2 opacity-60">Deploying UUPS Proxies...</p>
            <p>TrustToken       <span className="text-[#dab891]">0x..</span></p>
            <p>MarketCollection <span className="text-[#dab891]">0x..</span></p>
            <p>JuryDAO          <span className="text-[#dab891]">0x..</span></p>
            <p>PhygitalEscrow   <span className="text-[#dab891]">0x..</span></p>
            
            <p className="mt-4"><span className="text-emerald-400 animate-pulse">_</span></p>
          </div>
        </div>
      </section>
    </div>
  );
}
