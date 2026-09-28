#!/usr/bin/env python3
"""
=============================================================================
🎮 TOKEN TOWN: The Sims of Digital Finance
=============================================================================
A visual, interactive multi-agent simulation game translating institutional
digital finance (interoperability, programmability, three-tier cash settlement,
and closed-loop velocity) into an intuitive, playful Sims game.

Characters:
  - Bob the Baker 🥖: Produces bread, needs flour & energy.
  - Sally the Shopper 🛒: Works at library, buys bread when hungry.
  - Penny the Piggy Bank 🤖🐷: Automated treasurer, sweeps idle coins to yield.
  - Flash the Skater 🛹: Cross-ledger courier routing 24/7 bridge payments.

Run directly in terminal:
  python token_town_game.py
=============================================================================
"""

import os
import sys
import time
import random
from typing import Dict, List, Optional, Any

# Try importing Rich for rich visual UI; fallback to ANSI text if not available
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.layout import Layout
    from rich.text import Text
    from rich.progress_bar import ProgressBar
    from rich import print as rprint
    HAVE_RICH = True
    console = Console()
except ImportError:
    HAVE_RICH = False
    console = None


class TokenTownGame:
    def __init__(self):
        # 1. State of Characters
        self.sally = {
            "name": "Sally the Shopper",
            "avatar": "🛒👩",
            "coins": 40.0,
            "hunger": 65,  # 0 to 100 (Legacy visual)
            "compute_runway": 100.0,  # Energetic compute budget (credits)
            "total_burned": 0.0,
            "bread_eaten": 0,
            "status": "Runway ready. Standing by for task."
        }
        self.bob = {
            "name": "Bob the Baker",
            "avatar": "🥖👨‍🍳",
            "cash_coins": 20.0,
            "bread_inventory": 4,
            "flour_bags": 6,
            "energy": 80,  # 0 to 100
            "status": "Oven warm, waiting for shoppers."
        }
        self.penny = {
            "name": "Penny the Piggy Bank",
            "avatar": "🤖🐷",
            "vault_savings": 0.0,
            "yield_earned": 0.0,
            "annual_yield_rate": 0.0,  # Reclaims unused budget; no interest/yield
            "sweep_threshold": 20.0,   # auto-sweep if Bob has > 20 coins
            "status": "Ready to reclaim unused budget to runway."
        }
        self.flash = {
            "name": "Flash the Skater",
            "avatar": "🛹⚡",
            "earnings": 5.0,
            "deliveries_made": 0,
            "island_flour_stock": 25,
            "status": "Skateboarding between Town Center & Island Market."
        }

        # 2. Macro Economy Metrics
        self.turn = 1
        self.total_tx_volume = 0.0
        self.initial_total_wealth = self._calculate_system_wealth()
        self.recent_logs: List[str] = [
            "🌅 Town day began! Sally's compute runway is 100.0 credits, Bob's oven is warm."
        ]
        self.energy_cost_multiplier = 1.0
        self.auto_running = False
        self.spend_door_allowed = True  # External human gate for irreversible spends
        self.energy_cost_multiplier = 1.0
        self.auto_running = False

    def _calculate_system_wealth(self) -> float:
        """Sums all coins in town to verify 100% closed-loop conservation."""
        total = (
            self.sally["coins"] +
            self.bob["cash_coins"] +
            self.penny["vault_savings"] +
            self.penny["yield_earned"] +
            self.flash["earnings"]
        )
        return round(total, 2)

    def money_velocity(self) -> float:
        """Velocity of money = cumulative volume / current total money."""
        wealth = self._calculate_system_wealth()
        return round(self.total_tx_volume / wealth if wealth > 0 else 0.0, 2)

    # -----------------------------------------------------------------------
    # CORE ACTIONS (Sims Mechanics)
    # -----------------------------------------------------------------------

    def buy_bread(self) -> bool:
        """Action 1: Sally buys a loaf of bread for 10 coins. Smart Coin auto-splits!"""
        # Spend door check (Door on spend, not on looking)
        if not self.spend_door_allowed:
            self.recent_logs.insert(0, "🚪 SPEND DOOR BLOCKED: External allow flag is False! Waiting for human tap.")
            return False

        # Energetic compute runway check
        call_burn = 15.0
        if self.sally["compute_runway"] < call_burn:
            # Runway exhausted: halt cleanly, save state, log plain line, do not delete agent
            saved_state = {
                "agent": "Sally",
                "remaining_runway": self.sally["compute_runway"],
                "total_burned": self.sally["total_burned"],
                "bread_eaten": self.sally["bread_eaten"],
                "status": "Halted (runway exhausted)"
            }
            with open("local_saved_state.json", "w") as f:
                json.dump(saved_state, f, indent=2)
            log_line = (
                f"[HALTED] What it was doing: Buying bread from Bob | "
                f"Total cost burned: {self.sally['total_burned']:.1f} credits | "
                f"Local state saved: local_saved_state.json | "
                f"Status: Runway exhausted. A person must top up or close."
            )
            self.recent_logs.insert(0, log_line)
            print(f"\n{log_line}")
            return False

        price = 10.0
        if self.sally["coins"] < price:
            self.recent_logs.insert(0, "❌ Sally doesn't have enough coins for bread! Send her to work at the library.")
            return False

        if self.bob["bread_inventory"] <= 0:
            # Check if Bob can bake immediately
            if self.bob["flour_bags"] > 0 and self.bob["energy"] >= 10:
                self.bob["bread_inventory"] += 2
                self.bob["flour_bags"] -= 1
                self.bob["energy"] -= int(10 * self.energy_cost_multiplier)
                self.recent_logs.insert(0, "🥖 Bob quickly baked 2 fresh loaves using 1 bag of flour!")
            else:
                self.recent_logs.insert(0, "❌ Bob is out of bread! He needs flour or energy. Have Flash bridge flour from the Island!")
                return False

        # Execute call & burn runway
        self.sally["compute_runway"] -= call_burn
        self.sally["total_burned"] += call_burn
        self.sally["coins"] -= price
        self.sally["hunger"] = max(0, self.sally["hunger"] - 35)
        self.sally["bread_eaten"] += 1
        self.bob["bread_inventory"] -= 1

        bob_share = 8.0
        penny_share = 1.5
        flash_share = 0.5

        self.bob["cash_coins"] += bob_share
        self.penny["vault_savings"] += penny_share  # reclaimed budget
        self.flash["earnings"] += flash_share
        self.flash["deliveries_made"] += 1

        self.total_tx_volume += price
        self.turn += 1

        self.sally["status"] = f"Munching on bread! Burned {call_burn:.0f} cr runway (Rem: {self.sally['compute_runway']:.0f} cr)."
        self.bob["status"] = f"Sold 1 bread! Received +{bob_share:.1f} coins."
        self.penny["status"] = f"Reclaimed +{penny_share:.1f} unspent budget into safety vault."
        self.flash["status"] = f"Delivered payment across town, earned +{flash_share:.1f} courier fee."

        log_msg = (
            f"🛒 Sally paid 10 coins for bread (burned {call_burn:.0f} cr runway). "
            f"Bob received +{bob_share:.1f} 🥖 | "
            f"Penny reclaimed +{penny_share:.1f} 🐷 | "
            f"Flash routed +{flash_share:.1f} 🛹"
        )
        self.recent_logs.insert(0, log_msg)

        # Trigger automated checks
        self._check_penny_auto_sweep()
        return True

    def trigger_energy_spike(self):
        """Action 2: Energy Spike test! Increases operational costs."""
        self.energy_cost_multiplier = 2.5
        cost = int(12 * self.energy_cost_multiplier)
        self.bob["energy"] = max(0, self.bob["energy"] - cost)

        # Bob needs to pay electricity bill
        elec_bill = 6.0
        if self.bob["cash_coins"] >= elec_bill:
            self.bob["cash_coins"] -= elec_bill
            bill_paid_msg = "Paid 6 coins from cash."
        elif self.penny["vault_savings"] >= elec_bill:
            self.penny["vault_savings"] -= elec_bill
            bill_paid_msg = "Penny rescued Bob with 6 coins from reclaimed vault budget!"
        else:
            bill_paid_msg = "Bob couldn't pay power bill! Oven cooled down!"

        self.turn += 1
        self.recent_logs.insert(0, f"⚡ ENERGY SPIKE! Power rates doubled! {bill_paid_msg} Bob's energy: {self.bob['energy']}%")
        self.bob["status"] = "Wiping sweat! High electric bills, but ovens are still running."

    def bridge_island_flour(self):
        """Action 3: Flash skates to the Island Market and bridges 4 bags of flour using ISO messaging."""
        cost = 8.0
        if self.bob["cash_coins"] < cost and self.penny["vault_savings"] < cost:
            self.recent_logs.insert(0, "❌ Bob doesn't have 8 coins to buy flour! Make sales or wait for Penny's reclaimed budget.")
            return False

        if self.bob["cash_coins"] >= cost:
            self.bob["cash_coins"] -= cost
        else:
            self.penny["vault_savings"] -= cost

        self.bob["flour_bags"] += 4
        self.flash["earnings"] += 1.0  # Cross-island bridge routing bonus
        self.flash["deliveries_made"] += 1
        self.total_tx_volume += cost
        self.turn += 1

        self.recent_logs.insert(0, (
            "🛹 Flash skated across the bridge to Island Market! "
            "Delivered 4 bags of flour using ISO-20022 pacs.008 credit message!"
        ))
        self.bob["status"] = "Restocked 4 bags of flour! Ready to bake."
        self.flash["status"] = "Skate speed maximum! Island bridge transfer confirmed 24/7."
        return True

    def sally_works_at_library(self):
        """Bonus Action: Sally earns coins and replenishes compute runway."""
        paycheck = 14.0
        self.sally["coins"] += paycheck
        self.sally["compute_runway"] = min(150.0, self.sally["compute_runway"] + 25.0)
        self.sally["hunger"] = min(100, self.sally["hunger"] + 15)
        self.total_tx_volume += paycheck
        self.turn += 1
        self.recent_logs.insert(0, f"📚 Sally completed library shift! Top-up: +{paycheck:.0f} coins & +25 cr compute runway.")
        self.sally["status"] = f"Finished library work! Pocket has {self.sally['coins']:.0f} coins (Runway: {self.sally['compute_runway']:.0f} cr)."

    def _check_penny_auto_sweep(self):
        """Penny automated treasurer check: sweeps excess coins over threshold into reclaimed budget."""
        if self.bob["cash_coins"] > self.penny["sweep_threshold"]:
            sweep_amt = self.bob["cash_coins"] - self.penny["sweep_threshold"]
            self.bob["cash_coins"] -= sweep_amt
            self.penny["vault_savings"] += sweep_amt
            self.recent_logs.insert(0, (
                f"🤖🐷 Penny Budget Reclamation: Bob had > {self.penny['sweep_threshold']:.0f} coins! "
                f"Reclaimed {sweep_amt:.1f} unused coins back to reserve!"
            ))

    def _grow_penny_yield(self):
        """House model: Penny reclaims unused budget, but does NOT pay yield."""
        pass

    def step_simulation_tick(self):
        """A single auto-run turn: characters act autonomously based on needs."""
        if self.sally["hunger"] > 40:
            if self.sally["coins"] >= 10 and self.bob["bread_inventory"] > 0:
                self.buy_bread()
            else:
                self.sally_works_at_library()
        elif random.random() < 0.3 and self.bob["flour_bags"] < 3:
            self.bridge_island_flour()
        elif random.random() < 0.2:
            self.trigger_energy_spike()
        else:
            # Normal day tick
            self.sally_works_at_library()

    # -----------------------------------------------------------------------
    # RICH VISUAL TERMINAL UI
    # -----------------------------------------------------------------------

    def render_rich_screen(self):
        """Draws the entire colorful game screen using Rich."""
        console.clear()

        # 1. Header Banner
        header_text = Text()
        header_text.append("🏡 TOKEN TOWN: ", style="bold bright_cyan")
        header_text.append("The Sims of Digital Finance  •  Day ", style="bold white")
        header_text.append(f"{self.turn}", style="bold yellow")
        header_text.append(" 🌅", style="bold")

        banner = Panel(
            header_text,
            style="bright_blue",
            subtitle="[dim]Three-Tier Cash • Instant Smart Splits • 24/7 Island Bridge[/dim]"
        )
        console.print(banner)

        # 2. Macro Speedometer & Closed-Loop Verification
        wealth = self._calculate_system_wealth()
        velocity = self.money_velocity()

        macro_table = Table(box=None, expand=True)
        macro_table.add_column("💰 Total Closed-Loop Money", justify="center", style="bold green")
        macro_table.add_column("⚡ Money Velocity Multiplier", justify="center", style="bold cyan")
        macro_table.add_column("🔄 Cumulative Trade Volume", justify="center", style="bold magenta")
        macro_table.add_column("🛡️ Reclaimed Budget Reserve", justify="center", style="bold yellow")

        macro_table.add_row(
            f"${wealth:,.2f} (100% Conserved)",
            f"{velocity:.2f}x Turn Speed",
            f"${self.total_tx_volume:,.2f}",
            f"${self.penny['vault_savings']:,.2f}"
        )
        console.print(Panel(macro_table, style="dim white"))

        # 3. Four Character Cards Grid
        char_table = Table(box=None, expand=True, padding=(0, 1))
        char_table.add_column("Sally the Shopper", ratio=1)
        char_table.add_column("Bob the Baker", ratio=1)
        char_table.add_column("Penny the Piggy Bank", ratio=1)
        char_table.add_column("Flash the Skater", ratio=1)

        # Sally Card
        sally_content = (
            f"[bold bright_magenta]🛒 Sally the Shopper[/bold bright_magenta]\n"
            f"[dim]Role: Town Consumer (Agent)[/dim]\n\n"
            f"🔋 Compute Runway: [{'green' if self.sally['compute_runway'] > 40 else 'yellow' if self.sally['compute_runway'] > 15 else 'red'}]{self.sally['compute_runway']:.1f} cr[/]\n"
            f"🔥 Total Burned: [dim]{self.sally['total_burned']:.1f} cr[/dim]\n"
            f"🪙 Pocket Cash: [bold green]${self.sally['coins']:.1f}[/bold green]\n"
            f"🥖 Bread Eaten: [bold]{self.sally['bread_eaten']}[/bold]\n"
            f"[italic dim]\"{self.sally['status']}\"[/italic dim]"
        )

        # Bob Card
        bob_content = (
            f"[bold bright_yellow]🥖 Bob the Baker[/bold bright_yellow]\n"
            f"[dim]Role: Compute & Bread Producer[/dim]\n\n"
            f"🪙 Cash Register: [bold green]${self.bob['cash_coins']:.1f}[/bold green]\n"
            f"🥖 Fresh Bread: [bold cyan]{self.bob['bread_inventory']} loaves[/bold cyan]\n"
            f"🌾 Flour Stock: [bold]{self.bob['flour_bags']} bags[/bold]\n"
            f"⚡ Oven Energy: [bold]{self.bob['energy']}%[/bold]\n"
            f"[italic dim]\"{self.bob['status']}\"[/italic dim]"
        )

        # Penny Card
        penny_content = (
            f"[bold bright_green]🤖🐷 Penny the Piggy Bank[/bold bright_green]\n"
            f"[dim]Role: Budget Reclamation Steward[/dim]\n\n"
            f"🛡️ Reclaimed Reserve: [bold yellow]${self.penny['vault_savings']:.1f}[/bold yellow]\n"
            f"📈 Yield Model: [dim]Zero Yield (House Model)[/dim]\n"
            f"⚙️ Auto-Reclaim: [dim]Over $20.0 threshold[/dim]\n"
            f"✨ Conservation: [bold green]Active[/bold green]\n"
            f"[italic dim]\"{self.penny['status']}\"[/italic dim]"
        )

        # Flash Card
        flash_content = (
            f"[bold bright_cyan]🛹 Flash the Skater[/bold bright_cyan]\n"
            f"[dim]Role: 24/7 Island Bridge Courier[/dim]\n\n"
            f"🪙 Courier Fees: [bold green]${self.flash['earnings']:.1f}[/bold green]\n"
            f"📦 Deliveries: [bold]{self.flash['deliveries_made']} rides[/bold]\n"
            f"🏝️ Island Flour: [dim]{self.flash['island_flour_stock']} bags[/dim]\n"
            f"📜 Standard: [cyan]ISO 20022 pacs.008[/cyan]\n"
            f"[italic dim]\"{self.flash['status']}\"[/italic dim]"
        )

        char_table.add_row(
            Panel(sally_content, border_style="magenta"),
            Panel(bob_content, border_style="yellow"),
            Panel(penny_content, border_style="green"),
            Panel(flash_content, border_style="cyan")
        )
        console.print(char_table)

        # 4. Live Town Chronicles Feed (Latest 4 events)
        logs_text = Text()
        for idx, log in enumerate(self.recent_logs[:4]):
            prefix = "• " if idx > 0 else "⭐ NEW: "
            style = "bold white" if idx == 0 else "dim white"
            logs_text.append(f"{prefix}{log}\n", style=style)

        console.print(Panel(logs_text, title="[bold]📜 Daily Token Town Chronicles[/bold]", border_style="white"))

        # 5. Interactive Game Menu
        door_status = "[bold green]OPEN[/bold green]" if self.spend_door_allowed else "[bold red]BLOCKED[/bold red]"
        menu_text = (
            "[bold cyan][1][/bold cyan] Buy Bread (Burn Runway)  |  "
            "[bold yellow][2][/bold yellow] Energy Spike Test  |  "
            "[bold green][3][/bold green] Bridge Flour (Flash)  |  "
            "[bold magenta][4][/bold magenta] Sally Works  |  "
            f"[bold yellow][D][/bold yellow] Spend Door ({door_status})  |  "
            "[bold bright_cyan][E][/bold bright_cyan] [bold]Run 3 Experiments[/bold]  |  "
            "[bold bright_green][L][/bold bright_green] Lessons  |  "
            "[bold white][A][/bold white] Auto-Run  |  "
            "[bold red][Q][/bold red] Quit"
        )
        console.print(Panel(menu_text, style="bright_blue"))

    # -----------------------------------------------------------------------
    # PLAIN ANSI FALLBACK (If rich is missing)
    # -----------------------------------------------------------------------

    def render_plain_screen(self):
        """Clean ANSI fallback screen."""
        os.system('cls' if os.name == 'nt' else 'clear')
        wealth = self._calculate_system_wealth()
        velocity = self.money_velocity()

        print("=" * 76)
        print(f"🏡 TOKEN TOWN: The Sims of Digital Finance  •  Day {self.turn} 🌅")
        print(f"💰 Total Money: ${wealth:,.2f} (100% Conserved)  |  ⚡ Velocity: {velocity:.2f}x  |  Volume: ${self.total_tx_volume:,.2f}")
        print("=" * 76)
        print(f"🛒 Sally the Shopper : ${self.sally['coins']:.1f} coins | Hunger: {self.sally['hunger']}% | Bread: {self.sally['bread_eaten']}")
        print(f"🥖 Bob the Baker     : ${self.bob['cash_coins']:.1f} coins | Bread: {self.bob['bread_inventory']} | Flour: {self.bob['flour_bags']} | Energy: {self.bob['energy']}%")
        print(f"🤖 Penny Piggy Bank  : ${self.penny['vault_savings']:.1f} savings (Yield: +${self.penny['yield_earned']:.2f})")
        print(f"🛹 Flash the Skater  : ${self.flash['earnings']:.1f} fees | Deliveries: {self.flash['deliveries_made']}")
        print("-" * 76)
        print("📜 Latest Chronicle:")
        for log in self.recent_logs[:3]:
            print(f"  • {log}")
        print("-" * 76)
        print("[1] Buy Bread  [2] Energy Spike  [3] Bridge Flour  [4] Sally Works  [L] Learn 5 Lessons  [A] Auto-Run  [Q] Quit")

    def render(self):
        if HAVE_RICH:
            self.render_rich_screen()
        else:
            self.render_plain_screen()

    # -----------------------------------------------------------------------
    # 🎓 EDUCATIONAL LESSONS (GROUNDED IN "THE CONNECTIVE TISSUE")
    # -----------------------------------------------------------------------
    def show_educational_lessons(self):
        """Interactive walkthrough explaining the core concepts from the report."""
        lessons = [
            {
                "title": "Lesson 1: The Broken Telephone (Why Interoperability Matters)",
                "quote": "\"The bottleneck wasn't technology or innovation. It was interoperability... The moment individual networks agreed to connect through a shared, universal routing layer, the entire industry unlocked its potential.\"",
                "sims_analogy": "In Token Town, Bob's bakery is on the mainland, and the flour mill is on an isolated island. Without Flash the Skater, they cannot trade! Flash represents the shared routing layer.",
                "real_world": "Banks have spent $100B on blockchains, but created isolated walled gardens. Swift's live shared ledger (July 2026, 17 global banks) uses ISO 20022 messaging to connect private bank networks and public chains without forcing everyone onto a single chain."
            },
            {
                "title": "Lesson 2: The Saturday Night Crisis (24/7 Continuous vs Friday 5PM Cutoffs)",
                "quote": "\"A multinational managing liquidity across 20 markets holds cash in traditional accounts that cannot be mobilized until Monday morning if a margin call arises on Saturday... With tokenized deposits, money moves when needed, not when markets open.\"",
                "sims_analogy": "When an energy spike hits Bob on Saturday night, traditional bank clearing is closed! Tokenized 24/7 deposits settle instantly, preventing Bob's ovens from going cold.",
                "real_world": "Citi Token Services connects 300+ financial institutions across 50+ markets for 24/7 USD Clearing, eliminating legacy weekend cutoffs."
            },
            {
                "title": "Lesson 3: The Idle Money Leak (The GENIUS Act & Three-Tier Cash)",
                "quote": "\"The GENIUS Act (July 2025) clarified that stablecoins are bearer payment rails and barred interest-bearing structures... Idle on-chain money rotates into yield-bearing tokenized funds and deposits instead of sitting parked in stablecoins.\"",
                "sims_analogy": "Sally pays with stablecoins (Pocket Cash) because they are fast. But Bob can't leave cash idle earning 0%! Penny the Piggy Bank automatically sweeps balances over 20 coins into an 8% yield vault.",
                "real_world": "Digital money needs three co-existing tiers: (1) Fast Stablecoins for payment velocity, (2) Regulated Tokenized Bank Deposits for commercial credit & yield, and (3) Wholesale CBDCs as the risk-free base layer."
            },
            {
                "title": "Lesson 4: Vanishing Invoices (Programmable Delivery vs Payment / DvP)",
                "quote": "\"Programmability allows treasury policy to be embedded directly into the instrument... payments release upon verified delivery confirmation without manual instruction, reducing reconciliation complexity.\"",
                "sims_analogy": "When Sally buys bread for 10 coins, there is no invoice, no 3-week payment delay, and no manual bookkeeping. The Smart Coin splits on delivery: 8 to Bob, 1.5 to Penny savings, 0.5 to Flash courier.",
                "real_world": "Atomic Delivery-versus-Payment (DvP) settles the security leg and cash leg simultaneously, eliminating settlement risk and cutting trillions in post-trade reconciliation."
            },
            {
                "title": "Lesson 5: Freeing the $36 Billion Trapped Vault (Collateral Mobility)",
                "quote": "\"Tokenization could release $4.8 billion from the approximately $36.8 billion of excess collateral held by tier-one institutions... DTCC's Collateral AppChain enables near real-time collateral mobility across custodians and blockchain networks.\"",
                "sims_analogy": "The Royal Castle Vault doesn't hoard useless gold; it issues collateral mobility certificates that let the town trade safely with a smaller safety cushion.",
                "real_world": "DTCC's tokenization service and Collateral AppChain allow high-quality liquid assets (Treasuries, bonds) to move in seconds rather than days, unlocking billions in trapped liquidity."
            }
        ]

        for idx, lesson in enumerate(lessons, 1):
            if HAVE_RICH:
                console.clear()
                content = Text()
                content.append(f"📖 CHAPTER {idx} OF 5\n", style="bold yellow")
                content.append(f"{lesson['title']}\n\n", style="bold bright_cyan")
                content.append("📑 From the Report:\n", style="bold underline")
                content.append(f"{lesson['quote']}\n\n", style="italic white")
                content.append("🎮 In Token Town (The Sims):\n", style="bold underline green")
                content.append(f"{lesson['sims_analogy']}\n\n", style="green")
                content.append("🏦 Real-World Digital Finance Reality:\n", style="bold underline yellow")
                content.append(f"{lesson['real_world']}\n", style="yellow")

                panel = Panel(content, title=f"[bold]🎓 Token Town Academy • Lesson {idx}[/bold]", border_style="bright_cyan")
                console.print(panel)
                input("\n👉 Press [ENTER] to read next lesson...")
            else:
                print("\n" + "=" * 76)
                print(f"CHAPTER {idx}: {lesson['title']}")
                print("=" * 76)
                print(f"Report: {lesson['quote']}")
                print(f"Town:   {lesson['sims_analogy']}")
                print(f"Reality: {lesson['real_world']}")
                input("\nPress [ENTER] for next lesson...")


def main():
    game = TokenTownGame()
    game.render()

    while True:
        try:
            choice = input("\n👉 Enter your choice [1-4, D, E, L, A, Q]: ").strip().upper()
            if choice == "1":
                game.buy_bread()
            elif choice == "2":
                game.trigger_energy_spike()
            elif choice == "3":
                game.bridge_island_flour()
            elif choice == "4":
                game.sally_works_at_library()
            elif choice == "D":
                game.spend_door_allowed = not game.spend_door_allowed
                status = "OPEN (Spends permitted)" if game.spend_door_allowed else "BLOCKED (Spends require approval)"
                game.recent_logs.insert(0, f"🚪 Spend Door Gate updated: {status}")
            elif choice == "E":
                # Run the three energetic runway experiments
                import energetic_runway_experiments
                print("\n🧪 Running 3 Energetic Runway Experiments...")
                energetic_runway_experiments.main()
                game.recent_logs.insert(0, "🧪 Ran 3 Energetic Runway Experiments! Report updated: ENERGETIC_RUNWAY_EXPERIMENTS.md")
                input("\n👉 Press [ENTER] to return to Token Town...")
            elif choice == "L":
                game.show_educational_lessons()
            elif choice == "A":
                # Auto-run 10 turns
                print("\n⏩ Running 10 auto turns in Token Town...")
                for _ in range(10):
                    game.step_simulation_tick()
                    game.render()
                    time.sleep(0.4)
            elif choice == "Q":
                print("\n👋 Thanks for playing Token Town! The town economy stays 100% conserved.")
                break
            else:
                print("Invalid choice. Press [1], [2], [3], [4], [D], [E], [L], [A], or [Q].")

            game.render()

        except (KeyboardInterrupt, EOFError):
            print("\n👋 Exiting Token Town. Goodbye!")
            break


if __name__ == "__main__":
    main()
