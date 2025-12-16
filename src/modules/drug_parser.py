import re
import pandas as pd

# Constants for Regex
# Matches: 500 MG, 500MG, 0.5 %, 1000 UI, 5 GRS
REGEX_DOSIS = re.compile(r'(\d+(?:[.,]\d+)?)\s*(MG|G|GR|MCG|ML|%|UI|GRS)', re.IGNORECASE)

# Matches: X20 COMP, ENV 30, 20 COMP, 100 ML (Quantity)
REGEX_CANTIDAD = re.compile(r'(?:X\s*|ENV\s*|^|\s)(\d+)\s*(COMP|CAP|SOBRE|ML|AMPOLLA|FRASCO|UNID|UND|DOSIS|G)', re.IGNORECASE)

# Matches: LAB. CHILE, LABORATORIO MINTLAB, LAB SOPHIA
REGEX_LAB = re.compile(r'(?:LAB\.|LABORATORIO|LAB)\s+(.*)$', re.IGNORECASE)

class DrugParser:
    """
    Engine to parse unstructured pharmaceutical product strings into structured data.
    """
    
    @staticmethod
    def parse(product_name: str) -> dict:
        """
        Parses a single product string into its components.
        """
        if not isinstance(product_name, str):
            return {
                'original': str(product_name),
                'clean_name': str(product_name),
                'brand_type': 'UNKNOWN',
                'lab': 'NO IDENTIFICADO',
                'dose_val': None,
                'dose_unit': None,
                'qty_val': None,
                'qty_unit': None
            }
            
        text_bruto = product_name.upper().strip()
        resultado = {
            'original': text_bruto,
            'lab': 'NO IDENTIFICADO',
            'dose_val': None,
            'dose_unit': None,
            'qty_val': None,
            'qty_unit': None,
            'clean_name': text_bruto,
        }
        
        # 1. Extract Lab (Usually at the end)
        match_lab = REGEX_LAB.search(text_bruto)
        if match_lab:
            resultado['lab'] = match_lab.group(1).strip()
            # Remove from string to verify later
            text_bruto = text_bruto.replace(match_lab.group(0), '')
            
        # 2. Extract Dose
        # We might have multiple doses (Bioequivalent compound), we take the first one or all?
        # For simple parsing, let's take the first match as the primary dose.
        match_dosis = REGEX_DOSIS.search(text_bruto)
        if match_dosis:
            resultado['dose_val'] = match_dosis.group(1)
            resultado['dose_unit'] = match_dosis.group(2)
            # Remove from string, replace with space
            text_bruto = text_bruto.replace(match_dosis.group(0), ' ') 

        # 3. Extract Quantity / Format
        match_cant = REGEX_CANTIDAD.search(text_bruto)
        if match_cant:
            resultado['qty_val'] = match_cant.group(1)
            resultado['qty_unit'] = match_cant.group(2)
            text_bruto = text_bruto.replace(match_cant.group(0), ' ')
            
        # 4. Clean up remaining text to find the "Name" or "Brand"
        # Remove extra spaces, special chars like "3-A" if it looks like a prefix code
        text_bruto = re.sub(r'\s+', ' ', text_bruto).strip()
        
        # Heuristic: Remove typical artifacts or "X" if left over
        text_bruto = re.sub(r'\bX\d+\b', '', text_bruto) # remove things like X20 if missed
        
        resultado['clean_name'] = text_bruto.strip()
        
        return resultado

    @staticmethod
    def process_dataframe(df: pd.DataFrame, col_name: str = 'Producto') -> pd.DataFrame:
        """
        Applies parsing to a whole dataframe column and returns a new dataframe with expanded columns.
        """
        print(f"Parsing {len(df)} records...")
        parsed_data = df[col_name].apply(DrugParser.parse)
        
        # Convert list of dicts to DataFrame
        df_parsed = pd.json_normalize(parsed_data)
        
        # Merge back
        # We assume the index matches
        df_final = pd.concat([df.reset_index(drop=True), df_parsed], axis=1)
        return df_final
