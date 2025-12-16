import pandas as pd
import sqlite3
import os
import sys
try:
    from rapidfuzz import process, fuzz
    FUZZY_AVAILABLE = True
except ImportError:
    import difflib
    FUZZY_AVAILABLE = False
    print("⚠️  Rapidfuzz no instalado. Usando difflib (más lento).")

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from src.modules.drug_parser import DrugParser

# CONFIG
DB_PATH = os.path.join(os.path.dirname(__file__), '../../data/farmacia.db')
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), '../../data/schema.sql')
DATA_DIR = os.path.join(os.path.dirname(__file__), '../../data')

GOLAN_FILE = os.path.join(DATA_DIR, 'inventario golan.xlsx')
CENABAST_FILE = os.path.join(DATA_DIR, 'Maestro Materiales Cenabast Octubre 2025 - Listado Productos.csv')

def init_db():
    print("Inicializando Base de Datos...")
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH) # Fresh start for the migration
        
    conn = sqlite3.connect(DB_PATH)
    with open(SCHEMA_PATH, 'r') as f:
        conn.executescript(f.read())
    
    # Init Sucursal
    conn.execute("INSERT INTO SUCURSALES (nombre, direccion) VALUES ('Casa Matriz', 'Vallenar Centro')")
    conn.commit()
    return conn

def load_maestro(conn):
    print("Cargando Maestro CENABAST...")
    if not os.path.exists(CENABAST_FILE):
        print(f"⚠️  Advertencia: No se encontró {CENABAST_FILE}. Se creará un maestro vacío.")
        return

    try:
        df = pd.read_csv(CENABAST_FILE, on_bad_lines='skip')
        # Mapping columns based on typical Cenabast file structure
        # Adjust these names based on actual file headers if needed
        # We assume headers like: 'Nombre producto genérico', 'Código', 'Clasificación'
        
        # Prepare data for insertion
        records = []
        unique_names = set()
        
        for _, row in df.iterrows():
            nombre = str(row.get('Nombre producto genérico', '')).strip().upper()
            codigo = str(row.get('Código material', '')).strip()
            clasificacion = str(row.get('Clasificación interna', '')).strip()
            
            if nombre and nombre not in unique_names:
                records.append((codigo, nombre, clasificacion))
                unique_names.add(nombre)
        
        conn.executemany(
            "INSERT OR IGNORE INTO CATALOGO_MAESTRO (cenabast_id, nombre_generico, clasificacion) VALUES (?, ?, ?)",
            records
        )
        conn.commit()
        print(f"✓ {len(records)} productos maestros cargados.")
        
    except Exception as e:
        print(f"❌ Error cargando maestro: {e}")

def load_inventario(conn):
    print("Cargando Inventario Local (Golan)...")
    if not os.path.exists(GOLAN_FILE):
        print(f"❌ Error: No se encontró {GOLAN_FILE}")
        return

    # Load with pandas
    # Skip header row if needed, similar to what we saw in procesar_datos.py
    df = pd.read_excel(GOLAN_FILE, header=1, engine='openpyxl')
    
    # Normalize columns
    df.columns = [str(c).strip() for c in df.columns]
    
    # Find columns dynamically
    col_prod = next((c for c in df.columns if 'Producto' in c), None)
    col_stock = next((c for c in df.columns if 'Stock' in c), None)
    col_price = next((c for c in df.columns if 'Precio' in c), None)
    col_code = next((c for c in df.columns if 'Código' in c or 'Barra' in c), None)
    
    if not col_prod:
        print("❌ No se encontró columna de Producto")
        return

    # Pre-fetch Maestro for Linker
    print("Indexando Maestro para vinculación inteligente...")
    cursor = conn.execute("SELECT id, nombre_generico FROM CATALOGO_MAESTRO")
    maestro_cache = {row[1]: row[0] for row in cursor.fetchall()}
    maestro_keys = list(maestro_cache.keys())
    
    records_to_insert = []
    
    print(f"Procesando {len(df)} registros de inventario...")
    
    for i, row in df.iterrows():
        raw_name = str(row[col_prod])
        if raw_name == 'nan': continue
        
        # 1. Parse Data
        parsed = DrugParser.parse(raw_name)
        clean_name = parsed['clean_name']
        
        # 2. Extract Numbers
        try:
            stock = int(row[col_stock]) if pd.notna(row[col_stock]) else 0
        except: stock = 0
            
        try:
            precio = int(row[col_price]) if pd.notna(row[col_price]) else 0
        except: precio = 0
        
        sku = str(row[col_code]) if col_code and pd.notna(row[col_code]) else None

        # 3. SMART LINKING (The "Bioequivalence" Link)
        maestro_id = None
        
        # A. Exact Match
        if clean_name in maestro_cache:
            maestro_id = maestro_cache[clean_name]
        
        # B. Fuzzy Match (if needed) - Only if we have keys
        elif maestro_keys:
             if FUZZY_AVAILABLE:
                 match = process.extractOne(clean_name, maestro_keys, scorer=fuzz.token_set_ratio)
                 if match and match[1] > 85:
                     maestro_id = maestro_cache[match[0]]
             else:
                 # Fallback: difflib.get_close_matches
                 # It returns a list of matches, we take top 1
                 matches = difflib.get_close_matches(clean_name, maestro_keys, n=1, cutoff=0.8)
                 if matches:
                     maestro_id = maestro_cache[matches[0]]
        
        records_to_insert.append((sku, raw_name, precio, stock, maestro_id))
        
        if i % 500 == 0:
            print(f"   ...procesados {i}")

    conn.executemany(
        "INSERT INTO INVENTARIO_LOCAL (sku, nombre_comercial, precio, stock, maestro_id) VALUES (?, ?, ?, ?, ?)",
        records_to_insert
    )
    conn.commit()
    print(f"✓ {len(records_to_insert)} productos locales insertados.")

if __name__ == "__main__":
    connection = init_db()
    load_maestro(connection)
    load_inventario(connection)
    connection.close()
    print("\n✅ MIGRACIÓN COMPLETADA. Base de datos lista en data/farmacia.db")
