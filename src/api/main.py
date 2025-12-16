from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import os
from typing import List, Optional
from pydantic import BaseModel

app = FastAPI(title="Farmacia Vallenar API")

# CORs
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(__file__), '../../data/farmacia.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Models
class Product(BaseModel):
    id: int
    nombre: str
    precio: int
    stock: int
    status: str # 'AVAILABLE', 'ORDER' (Encargo), 'REF' (Referencia)
    is_bioequivalent: bool
    is_generic: bool
    savings: Optional[int] = 0
    maestro_id: Optional[int] = None

class SearchResponse(BaseModel):
    query: str
    results: List[Product]

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/search", response_model=SearchResponse)
def search_products(q: str = Query(..., min_length=2)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    q_str = f"%{q.upper()}%"
    
    # 1. Search in Local Inventory
    cursor.execute("""
        SELECT 
            i.id, i.nombre_comercial, i.precio, i.stock, i.maestro_id,
            m.nombre_generico, m.es_bioequivalente
        FROM INVENTARIO_LOCAL i
        LEFT JOIN CATALOGO_MAESTRO m ON i.maestro_id = m.id
        WHERE i.nombre_comercial LIKE ? OR m.nombre_generico LIKE ?
        ORDER BY i.stock DESC, i.precio ASC
        LIMIT 20
    """, (q_str, q_str))
    
    rows = cursor.fetchall()
    results = []
    
    # Logic to determine "Bioequivalent Alternatives"
    # If a result is a BRAND and has a maestro_id, we should fetch its GENERIC siblings
    
    for row in rows:
        status = "REF"
        if row['stock'] > 0:
            status = "AVAILABLE"
        elif row['precio'] > 0:
            status = "ORDER"
            
        # Check bioequivalence flag from Maestro
        # In our schema, we assume if it has a maestro_id, it participates in the bioequivalence program
        is_bio = row['maestro_id'] is not None
        
        # Heuristic for Generic: If name matches generic name roughly
        is_gen = False
        if row['nombre_generico'] and row['nombre_generico'] in row['nombre_comercial']:
            is_gen = True

        results.append({
            "id": row['id'],
            "nombre": row['nombre_comercial'],
            "precio": row['precio'],
            "stock": row['stock'],
            "status": status,
            "is_bioequivalent": is_bio,
            "is_generic": is_gen,
            "maestro_id": row['maestro_id']
        })
        
    conn.close()
    return {"query": q, "results": results}

@app.get("/product/{product_id}/alternatives")
def get_alternatives(product_id: int):
    """
    Get bioequivalent alternatives for a specific product ID.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get the product's maestro_id
    cursor.execute("SELECT maestro_id, precio FROM INVENTARIO_LOCAL WHERE id = ?", (product_id,))
    prod = cursor.fetchone()
    
    if not prod or not prod['maestro_id']:
        return {"alternatives": []}
        
    maestro_id = prod['maestro_id']
    base_price = prod['precio']
    
    # Search siblings
    cursor.execute("""
        SELECT 
            i.id, i.nombre_comercial, i.precio, i.stock,
            m.nombre_generico
        FROM INVENTARIO_LOCAL i
        JOIN CATALOGO_MAESTRO m ON i.maestro_id = m.id
        WHERE i.maestro_id = ? AND i.id != ? AND i.stock > 0
        ORDER BY i.precio ASC
    """, (maestro_id, product_id))
    
    rows = cursor.fetchall()
    alts = []
    for row in rows:
        savings = max(0, base_price - row['precio'])
        alts.append({
            "id": row['id'],
            "nombre": row['nombre_comercial'],
            "precio": row['precio'],
            "stock": row['stock'],
            "savings": savings,
            "is_generic": row['nombre_generico'] in row['nombre_comercial']
        })
        
    return {"alternatives": alts}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
