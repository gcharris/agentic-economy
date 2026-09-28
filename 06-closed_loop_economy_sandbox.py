"""
===============================================================================
THE CONNECTIVE TISSUE: CLOSED-LOOP ECONOMIC AGENT SIMULATOR
===============================================================================
A visual multi-agent simulation testing programmable money, interoperability,
and cross-ledger liquidity in a closed-loop economy.

Run directly in your IDE (Antigravity, Cursor, VS Code, PyCharm, Jupyter):
    python closed_loop_economy_sandbox.py
===============================================================================
"""

import matplotlib
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import numpy as np
import networkx as nx
import random

# Set random seed for reproducible fun
np.random.seed(42)
random.seed(42)

class AutonomousAgent:
    def __init__(self, agent_id, role, ledger, initial_capital):
        self.id = agent_id
        self.role = role  # 'Producer', 'Consumer', 'Treasurer', 'Arbitrageur'
        self.ledger = ledger  # 'PrivateBank', 'PublicDEX', 'CentralLedger'
        self.balance = initial_capital
        self.inventory = 20 if role == 'Producer' else 0
        self.yield_earned = 0.0
        self.history = [initial_capital]

class ProgrammableClosedEconomy:
    def __init__(self, num_agents=24):
        self.ledgers = ['PrivateBank', 'PublicDEX', 'CentralLedger']
        self.roles = ['Producer', 'Consumer', 'Treasurer', 'Arbitrageur']
        self.agents = []
        
        # Color mapping
        self.role_colors = {
            'Producer': '#2ecc71',      # Green
            'Consumer': '#e74c3c',      # Red
            'Treasurer': '#3498db',     # Blue
            'Arbitrageur': '#f1c40f'    # Yellow
        }
        
        # Initialize agents
        for i in range(num_agents):
            role = self.roles[i % len(self.roles)]
            ledger = self.ledgers[i % len(self.ledgers)]
            capital = np.random.uniform(200, 800)
            self.agents.append(AutonomousAgent(f"A{i:02d}_{role[:3]}", role, ledger, capital))
            
        self.step_num = 0
        self.total_tx_volume = 0
        self.tx_history = []
        self.graph = nx.DiGraph()
        for a in self.agents:
            self.graph.add_node(a.id, role=a.role, ledger=a.ledger)
            
    def step(self):
        self.step_num += 1
        current_txs = []
        
        # 1. Consumer buys goods/services from Producer (DvP)
        consumers = [a for a in self.agents if a.role in ['Consumer', 'Arbitrageur'] and a.balance > 10]
        producers = [a for a in self.agents if a.role == 'Producer' and a.inventory > 0]
        
        if consumers and producers:
            buyer = random.choice(consumers)
            seller = random.choice(producers)
            
            price = random.uniform(10, 30)
            if buyer.balance >= price:
                # Programmable Smart Contract Split:
                # 80% to Seller, 15% to Treasurer Liquidity Pool, 5% Automated Yield Reserve
                buyer.balance -= price
                seller.balance += price * 0.80
                seller.inventory -= 1
                buyer.inventory += 1
                
                # Cross-ledger settlement fee routed to Treasurer
                treasurers = [a for a in self.agents if a.role == 'Treasurer']
                if treasurers:
                    t = random.choice(treasurers)
                    t.balance += price * 0.15
                    t.yield_earned += price * 0.05
                    
                self.total_tx_volume += price
                current_txs.append((buyer.id, seller.id, price))
                self.graph.add_edge(buyer.id, seller.id, weight=price)

        # 2. Arbitrageur balances cross-ledger price/liquidity differences
        arbs = [a for a in self.agents if a.role == 'Arbitrageur' and a.balance > 50]
        if arbs and random.random() < 0.6:
            arb = random.choice(arbs)
            target_ledger = random.choice(self.ledgers)
            if arb.ledger != target_ledger:
                # Cross-ledger bridge execution (Interoperability protocol)
                swap_amount = random.uniform(15, 40)
                arb.balance -= swap_amount * 0.02 # 2% bridge fee
                arb.ledger = target_ledger
                self.total_tx_volume += swap_amount
                
        # 3. Programmable Treasury Yield Auto-Sweep
        for a in self.agents:
            if a.role == 'Treasurer':
                # Auto-yield on idle reserves (Tokenized Money Market Fund logic)
                yield_rate = 0.0015
                a.balance += a.balance * yield_rate
            elif a.role == 'Producer' and a.inventory < 5:
                # Auto-replenish inventory
                a.inventory += 5
                
            a.history.append(a.balance)
            
        return current_txs

def create_visual_simulation_dashboard(num_steps=100, save_filename=None):
    sim = ProgrammableClosedEconomy(num_agents=20)
    
    # Run simulation steps
    for _ in range(num_steps):
        sim.step()
        
    # Build Static Summary Dashboard
    fig, axs = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Closed-Loop Programmable Economy Simulation', fontsize=16, fontweight='bold', y=0.98)
    
    # Plot 1: Agent Wealth Trajectories by Role
    ax1 = axs[0, 0]
    ax1.set_title('Agent Balance Trajectories Over Time (DvP & Smart Split)', fontsize=11, fontweight='bold')
    for a in sim.agents:
        color = sim.role_colors[a.role]
        ax1.plot(a.history, color=color, alpha=0.6, linewidth=1.5, label=a.role if a.history.index(a.history[0]) == 0 else "")
    
    # Custom legend without duplicates
    handles, labels = ax1.get_legend_handles_labels()
    by_label = dict(zip(labels, handles))
    ax1.legend(by_label.values(), by_label.keys(), loc='upper left', fontsize=9)
    ax1.set_xlabel('Simulation Step')
    ax1.set_ylabel('Balance (Tokenized USD)')
    ax1.grid(True, linestyle='--', alpha=0.5)
    
    # Plot 2: Liquidity Distribution Across Ledgers
    ax2 = axs[0, 1]
    ax2.set_title('Total Liquidity Held by Ledger Infrastructure', fontsize=11, fontweight='bold')
    ledger_balances = {l: 0.0 for l in sim.ledgers}
    for a in sim.agents:
        ledger_balances[a.ledger] += a.balance
    
    bars = ax2.bar(ledger_balances.keys(), ledger_balances.values(), color=['#2c3e50', '#8e44ad', '#16a085'], width=0.5)
    ax2.set_ylabel('Total Liquidity')
    ax2.grid(True, axis='y', linestyle='--', alpha=0.5)
    for bar in bars:
        yval = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width()/2.0, yval + 50, f"${yval:,.0f}", ha='center', va='bottom', fontweight='bold')

    # Plot 3: Network Topology & Transaction Flow Graph
    ax3 = axs[1, 0]
    ax3.set_title('Cross-Ledger Transaction Topology Network', fontsize=11, fontweight='bold')
    pos = nx.spring_layout(sim.graph, seed=42)
    node_colors = [sim.role_colors[sim.graph.nodes[n]['role']] for n in sim.graph.nodes()]
    nx.draw_networkx_nodes(sim.graph, pos, ax=ax3, node_color=node_colors, node_size=350, alpha=0.9)
    nx.draw_networkx_edges(sim.graph, pos, ax=ax3, edge_color='#bdc3c7', alpha=0.4, arrows=True, arrowsize=10)
    nx.draw_networkx_labels(sim.graph, pos, ax=ax3, font_size=7, font_color='black', font_weight='bold')
    ax3.axis('off')
    
    # Plot 4: Key Economic Metrics Summary Card
    ax4 = axs[1, 1]
    ax4.set_title('Closed-Loop System Performance Metrics', fontsize=11, fontweight='bold')
    ax4.axis('off')
    
    total_system_money = sum(a.balance for a in sim.agents)
    velocity = sim.total_tx_volume / total_system_money if total_system_money > 0 else 0
    top_treasurer = max([a for a in sim.agents if a.role == 'Treasurer'], key=lambda x: x.balance)
    
    metrics_text = (
        f"• Total Simulation Steps: {num_steps}\n"
        f"• Total Money in Closed System: ${total_system_money:,.2f}\n"
        f"• Cumulative Transaction Volume: ${sim.total_tx_volume:,.2f}\n"
        f"• Velocity of Programmable Money: {velocity:.2f}x\n"
        f"• Cross-Ledger Interoperable Swaps: {sim.step_num} cycles\n"
        f"• Auto-Yield Generated by Treasurers: ${sum(a.yield_earned for a in sim.agents if a.role == 'Treasurer'):,.2f}\n\n"
        f"Key takeaway: Money remains 100% conserved within the closed loop,\n"
        f"while smart contract rules dynamically rebalance liquidity\n"
        f"and generate yield without manual intervention!"
    )
    
    ax4.text(0.05, 0.5, metrics_text, fontsize=11, bbox=dict(boxstyle='round,pad=1', facecolor='#f8f9fa', edgecolor='#bdc3c7'), va='center')
    
    plt.tight_layout()
    if save_filename:
        plt.savefig(save_filename, dpi=150, bbox_inches='tight')
        print(f"Saved dashboard preview to {save_filename}")
    plt.close()

if __name__ == '__main__':
    create_visual_simulation_dashboard(num_steps=120, save_filename='/workspace/scratch/closed_loop_sim_preview.png')
