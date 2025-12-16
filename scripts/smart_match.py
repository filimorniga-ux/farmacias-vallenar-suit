import os
import re
import psycopg2
import pandas as pd
from difflib import SequenceMatcher
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
DB_URL = os.getenv("DATABASE_URL")
CSV_PATH = "data/isp_oficial.csv"

# Normalization Function
def normalize_text(text):
    if not isinstance(text, str):
        return ""
    
    # Uppercase
    text = text.upper()
    
    # Remove stop words
    stop_words = ['MG', 'COMPRIMIDOS', 'CAPSULAS', 'JARABE', 'CM', 'AL', 'X', 'CAJA', 'FRASCO']
    for word in stop_words:
        text = re.sub(r'\b' + word + r'\b', '', text)
    
    # Remove special chars and extra spaces
    text = re.sub(r'[^A-Z0-9\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()

def main():
    if not DB_URL:
        print("❌ Error: DATABASE_URL not found in environment.")
        return

    print("🔌 Connecting to Database...")
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return

    print(f"📂 Reading CSV from {CSV_PATH}...")
    try:
        # User suggested header=2, but visual inspection suggests header=3 (line 4).
        # We'll try header=3 first based on 'N;Principio Activo...'
        df_isp = pd.read_csv(CSV_PATH, sep=';', header=3, encoding='latin1')
        print(f"   Loaded {len(df_isp)} ISP records.")
    except Exception as e:
        print(f"❌ Failed to read CSV: {e}")
        return

    print("📥 Fetching products from DB...")
    cur.execute("SELECT id, name, laboratory FROM products")
    products = cur.fetchall()
    print(f"   Loaded {len(products)} products from DB.")

    updates_dci = 0
    updates_bio = 0

    print("🚀 Starting Logic Reconciliation...")

    # Pre-process ISP data to avoid repeated normalization
    # Unique Active Principles
    unique_principles = df_isp['Principio Activo'].dropna().unique()
    normalized_principles = [(p, normalize_text(p)) for p in unique_principles]

    # Map for Bioequivalence check: Principle -> List of (Product Name, Lab, Status)
    # Filter only relevant columns to speed up
    bio_map = []
    for _, row in df_isp.iterrows():
        p_active = row['Principio Activo']
        if pd.isna(p_active): continue
        
        status = row.get('Estado', '')
        if 'EQUIVALENTE' in str(status).upper():
            bio_map.append({
                'principio': normalize_text(p_active),
                'producto': normalize_text(str(row['Producto '])), # Note the space in CSV header "Producto "
                'titular': normalize_text(str(row['Titular'])),
                'vigencia': str(row.get('Vigencia', '')).upper()
            })

    # Processing Products
    for pid, raw_name, raw_lab in products:
        norm_name = normalize_text(raw_name)
        norm_lab = normalize_text(raw_lab if raw_lab else "")
        
        detected_dci = None
        is_bioequivalent = False

        # STEP 1: FILL DCI
        # Check if normalized name contains any normalized principle
        # Heuristic: Match longest principle first? Or just any?
        # Let's try to match.
        for original_p, norm_p in normalized_principles:
            if len(norm_p) < 3: continue # Skip too short
            
            # Strict substring match as requested
            # "Si el nombre del producto en la DB contiene el string del Principio Activo"
            if norm_p in norm_name:
                detected_dci = original_p # Store original formal name
                break # Found one match
        
        # STEP 2: BIOEQUIVALENCE
        if detected_dci:
            # Look for matches in bio_map with this principle
            norm_dci = normalize_text(detected_dci)
            
            for entry in bio_map:
                if entry['principio'] != norm_dci: continue
                
                # Check if Lab matches fuzzy OR Product Name matches fuzzy
                # "verifica si la marca o el laboratorio coinciden parcialmente"
                
                lab_score = similar(norm_lab, entry['titular'])
                name_score = similar(norm_name, entry['producto'])
                
                # Threshold for fuzzy match
                if (lab_score > 0.6 or name_score > 0.6) and 'NO' not in entry['vigencia']:
                    is_bioequivalent = True
                    break

        # UPDATE DB
        if detected_dci or is_bioequivalent:
            try:
                # Construct query dynamically based on what we found
                if detected_dci and is_bioequivalent:
                    cur.execute("""
                        UPDATE products 
                        SET dci = %s, is_bioequivalent = %s 
                        WHERE id = %s
                    """, (detected_dci, True, pid))
                    updates_dci += 1
                    updates_bio += 1
                elif detected_dci:
                    cur.execute("""
                        UPDATE products 
                        SET dci = %s 
                        WHERE id = %s
                    """, (detected_dci, pid))
                    updates_dci += 1
                elif is_bioequivalent:
                    cur.execute("""
                        UPDATE products 
                        SET is_bioequivalent = %s 
                        WHERE id = %s
                    """, (True, pid))
                    updates_bio += 1
                    
            except Exception as e:
                print(f"⚠️ Error updating product {pid}: {e}")
                conn.rollback()

    conn.commit()
    cur.close()
    conn.close()

    print("\n" + "="*40)
    print("✅ RECONCILIATION COMPLETE")
    print(f"📝 Updated DCI: {updates_dci}")
    print(f"🧪 Flagged Bioequivalents: {updates_bio}")
    print("="*40 + "\n")

if __name__ == "__main__":
    main()
