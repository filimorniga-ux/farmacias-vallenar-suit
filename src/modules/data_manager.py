import pandas as pd
import os
import sys

# Add project root to path if needed for direct execution
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.modules.drug_parser import DrugParser

try:
    from rapidfuzz import process, fuzz
    FUZZY_AVAILABLE = True
except ImportError:
    import difflib
    FUZZY_AVAILABLE = False
    print("Warning: rapidfuzz not found, using difflib (slower).")

class DataManager:
    """
    Central Data Hub for the Pharmaceutical Module.
    Responsible for loading inventory, parsing it, and determining bioequivalence.
    """
    
    def __init__(self, data_path):
        self.data_path = data_path
        self.inventory_df = None
        self.isp_db_mock = self._load_mock_isp_db()
        
    def _load_mock_isp_db(self):
        """
        Simulates the ISP Database of Bioequivalent/Certified products.
        In a real scenario, this would load 'registros_isp.csv'.
        """
        # Key: Active Ingredient (Normalized), Value: List of products/brands
        return {
            "ACICLOVIR 200 MG": {
                "generics": ["ACICLOVIR 200 MG"], 
                "brands": ["ZOVIRAX 200 MG"],
                "active_ingredient": "ACICLOVIR"
            },
            "ACIDO ACETILSALICILICO 100 MG": {
                "generics": ["ACIDO ACETILSALICILICO 100 MG"],
                "brands": ["CARDIOASPIRINA 100", "ASPIRINA 100"],
                "active_ingredient": "ACIDO ACETILSALICILICO"
            },
            "PARACETAMOL 500 MG": {
                 "generics": ["PARACETAMOL 500 MG"],
                 "brands": ["PANADOL", "KITADOL"],
                 "active_ingredient": "PARACETAMOL"
            },
            "IBUPROFENO 400 MG": {
                "generics": ["IBUPROFENO 400 MG"],
                "brands": ["IBUPIRAC", "ACTRON"],
                "active_ingredient": "IBUPROFENO"
            },
            "LOSARTAN 50 MG": {
                "generics": ["LOSARTAN 50 MG", "LOSARTAN POTASICO 50 MG"],
                "brands": ["COZAAR"],
                "active_ingredient": "LOSARTAN"
            },
            "DIONOGEST 2 MG": {
                 "generics": ["DIONOGEST"], # Hypothetical generic
                 "brands": ["ACOTOL"],
                 "active_ingredient": "DIONOGEST + ETINILESTRADIOL"
            }
        }

    def load_data(self):
        """Loads and parses the raw golan.csv"""
        if not os.path.exists(self.data_path):
            raise FileNotFoundError(f"File not found: {self.data_path}")
            
        # Initialize loading
        print("Loading raw inventory...")
        # Using ; separator as seen in view_file of golan.csv
        df = pd.read_csv(self.data_path, sep=';', on_bad_lines='skip')
        
        # Rename columns if needed (based on view_file output)
        # 1: Grupo de Producto;Producto;Código Barras;Stock;Costo Neto Prom. Unitario;Precio Venta 
        df.columns = [c.strip() for c in df.columns]
        
        # Apply Parsing
        print("Structuring unstructured data...")
        self.inventory_df = DrugParser.process_dataframe(df, col_name='Producto')
        
        # Determine Bioequivalence
        print("Linking with Regulatory Data (Simulated)...")
        self.inventory_df = self.inventory_df.apply(self._enrich_compliance, axis=1)
        
        return self.inventory_df

    def _enrich_compliance(self, row):
        """
        Adds regulatory flags: Is_Bioequivalent, Active_Ingredient, is_Generic
        """
        clean_name = str(row.get('clean_name', '')).upper()
        # Fallback to search if clean_name is empty
        if not clean_name: clean_name = str(row.get('Producto', '')).upper()
        
        found_active_ingredient = "DESCONOCIDO"
        is_bioequivalent = False
        is_generic = False # Default
        
        # 1. Try to find the active ingredient in our Mock DB
        # This is a naive heuristic (substring matching) for the demo
        best_match = None
        
        # We search against the keys of our mock DB (which are usually "INGREDIENT DOSE")
        if FUZZY_AVAILABLE:
            match_tuple = process.extractOne(clean_name, list(self.isp_db_mock.keys()), scorer=fuzz.token_set_ratio)
            if match_tuple and match_tuple[1] > 85: # Threshold
                best_match = match_tuple[0]
        else:
            # Fallback 1: Check keys
            for key in self.isp_db_mock.keys():
                if key in clean_name:
                    best_match = key
                    break
            
            # Fallback 2: Check Brands (Reverse Lookup)
            if not best_match:
                for key, data in self.isp_db_mock.items():
                    for brand in data.get('brands', []):
                        if brand in clean_name:
                            best_match = key
                            break
                    if best_match: break
        
        if best_match:
            data = self.isp_db_mock[best_match]
            found_active_ingredient = data['active_ingredient']
            
            # 2. Check if it IS a generic (matches the active ingredient name strongly)
            if found_active_ingredient in clean_name and "COMPUESTO" not in clean_name:
                 # Check if it's purely descriptive (e.g. "PARACETAMOL 500MG") vs Brand ("KITADOL")
                 # Heuristic: If the cleaned name is very similar to the active ingredient, it's generic
                 ratio = 0
                 if FUZZY_AVAILABLE:
                     ratio = fuzz.ratio(clean_name.replace("MG","").strip(), found_active_ingredient)
                 else:
                     ratio = 100 if clean_name.startswith(found_active_ingredient) else 0
                 
                 if ratio > 60: 
                     is_generic = True
                     is_bioequivalent = True # Core assumption: Generics in DB are bioequivalent
            
            # 3. Check matching brands
            for brand in data['brands']:
                if brand in clean_name:
                    is_bioequivalent = True # Brands in DB are bioequivalent
                    is_generic = False

        row['Active_Ingredient'] = found_active_ingredient
        row['Is_Bioequivalent'] = is_bioequivalent
        row['Is_Generic'] = is_generic
        row['Calculated_PPUM'] = self._calculate_ppum(row)
        
        return row

    def _calculate_ppum(self, row):
        """
        Calculates Price Per Unit of Measure (required by law).
        """
        try:
            price = float(str(row['Precio Venta']).replace(',','.'))
            qty = float(row['qty_val'])
            if qty > 0:
                return round(price / qty, 2)
        except (ValueError, TypeError):
            pass
        return 0

if __name__ == "__main__":
    # Test run
    mgr = DataManager(os.path.join(os.path.dirname(__file__), '../../golan.csv'))
    df = mgr.load_data()
    print(df[['Producto', 'Active_Ingredient', 'Is_Bioequivalent', 'Is_Generic']].head(20))
