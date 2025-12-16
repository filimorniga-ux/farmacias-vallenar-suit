import os
import sys
import time
import pandas as pd

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from src.modules.data_manager import DataManager

# ==========================================
# UI COLORS (ANSI)
# ==========================================
YELLOW = "\033[93m"  # Bioequivalent Generic
GREEN = "\033[92m"   # Brand Bioequivalent
BLUE = "\033[94m"    # Requested Product
GREY = "\033[90m"
RESET = "\033[0m"
BOLD = "\033[1m"

class FarmaciaVallenarEngine:
    def __init__(self):
        print(f"{BOLD}--- INICIANDO SISTEMA FARMACÉUTICO VALLENAR (MODULO BIOEQUIVALENCIA) ---{RESET}")
        base_dir = os.path.dirname(os.path.abspath(__file__))
        csv_path = os.path.join(base_dir, 'golan.csv')
        
        self.mgr = DataManager(csv_path)
        self.df = self.mgr.load_data()
        print(f"{GREEN}✓ Sistema cargado: {len(self.df)} productos en memoria.{RESET}")

    def buscar(self, query):
        query = query.upper().strip()
        print(f"\nProcesando solicitud: {BOLD}'{query}'{RESET}...")
        
        # 1. Direct Search (What the user asked for)
        # We look for the exact string first, or fuzzy match
        matches = self.df[self.df['clean_name'].str.contains(query, case=False, na=False)].copy()
        
        if matches.empty:
            print(f"❌ No se encontraron productos con el nombre '{query}'.")
            return

        # 2. Resolve Active Ingredient
        # We assume the user wants the first match's active ingredient
        # In a real app, if multiple are found, we'd ask "Did you mean X or Y?"
        target_product = matches.iloc[0]
        active_ing = target_product['Active_Ingredient']
        
        print(f"➜ Principio Activo Detectado: {BOLD}{active_ing}{RESET}")
        
        # 3. Fetch Substitutes (Bioequivalents)
        if active_ing != "DESCONOCIDO":
            alternatives = self.df[
                (self.df['Active_Ingredient'] == active_ing) & 
                (self.df['Stock'] > 0) # Only what we have
            ].copy()
        else:
            # Fallback: Just show name matches if we don't know the ingredient
            alternatives = matches

        # 4. Ranking Logic (The Core Requirement)
        # Priority 1: Generic Bioequivalent (Is_Generic=True, Is_Bioequivalent=True)
        # Priority 2: Brand Bioequivalent (Is_Generic=False, Is_Bioequivalent=True)
        # Priority 3: Requested Product (if not in above)
        # Priority 4: Others
        
        def calculate_rank(row):
            # If it matches the user query exactly, it's special (The "Requested" one)
            is_requested = query in str(row['clean_name'])
            
            if row['Is_Generic'] and row['Is_Bioequivalent']:
                return 1 # Best (Yellow)
            if row['Is_Bioequivalent']:
                return 2 # Good (Brand Bioeq)
            if is_requested:
                return 3 # What they asked for (if not bioeq)
            return 4 # Others
            
        alternatives['Rank'] = alternatives.apply(calculate_rank, axis=1)
        
        # Sort by Rank (asc), then Price (asc)
        sorted_results = alternatives.sort_values(by=['Rank', 'Precio Venta'])
        
        self._render_results(sorted_results, query)

    def _render_results(self, results, original_query):
        print(f"\n{BOLD}{'TIPO':<15} | {'PRODUCTO':<40} | {'PRECIO':<10} | {'PPUM':<10} | {'AHORRO'}{RESET}")
        print("-" * 95)
        
        # Reference price (Price of the requested product, or the most expensive one in the list to confirm savings)
        # Let's try to find the price of the product that most closely matches the query
        ref_rows = results[results['clean_name'].str.contains(original_query, na=False)]
        ref_price = ref_rows.iloc[0]['Precio Venta'] if not ref_rows.empty else results.iloc[0]['Precio Venta']
        
        for _, row in results.iterrows():
            tipo = "OTROS"
            color = GREY
            ahorro_str = ""
            
            if row['Rank'] == 1:
                tipo = "BIO GENÉRICO"
                color = YELLOW
                # Calculate savings relative to reference
                if ref_price > row['Precio Venta']:
                    diff = ref_price - row['Precio Venta']
                    ahorro_str = f"SAVE ${diff:,.0f}"
            elif row['Rank'] == 2:
                tipo = "BIO MARCA"
                color = GREEN
            elif row['Rank'] == 3:
                tipo = "SOLICITADO"
                color = BLUE
            
            # Formatting
            price_fmt = f"${row['Precio Venta']:,.0f}"
            ppum_fmt = f"${row['Calculated_PPUM']:,.1f}" if row['Calculated_PPUM'] > 0 else "-"
            name_fmt = row['clean_name'][:38]
            
            # Badge for Bioequivalence
            if row['Is_Bioequivalent']:
                name_fmt = f"🟨 {name_fmt}"
            
            print(f"{color}{tipo:<15} | {name_fmt:<40} | {price_fmt:<10} | {ppum_fmt:<10} | {ahorro_str}{RESET}")
            
        print("-" * 95)
        print(f"{GREY}* PPUM: Precio Por Unidad de Medida (Obligatorio ISP){RESET}")


if __name__ == "__main__":
    engine = FarmaciaVallenarEngine()
    while True:
        try:
            q = input("\n🔍 Buscador (Escribe 'salir'): ")
            if q.lower() in ['salir', 'exit']:
                break
            engine.buscar(q)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {e}")