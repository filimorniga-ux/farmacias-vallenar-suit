import pandas as pd
import numpy as np
import os
import re

# ==========================================
# CONFIGURACIÓN
# ==========================================
base_dir = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(base_dir, 'data')

nombre_excel_inventario = "inventario golan.xlsx"
nombre_csv_cenabast = "Maestro Materiales Cenabast Octubre 2025 - Listado Productos.csv"

archivo_inventario = os.path.join(data_dir, nombre_excel_inventario)
archivo_cenabast = os.path.join(data_dir, nombre_csv_cenabast)
archivo_salida = os.path.join(data_dir, "Base_Datos_Completa_Vallenar.csv")

print(f"--- GENERANDO CATÁLOGO INTEGRAL V3.0 ---")

# ==========================================
# 1. LECTURA Y CORRECCIÓN DE COLUMNAS
# ==========================================
print("Leyendo Excel Maestro...")
# Leemos con header=1 porque la fila 1 tiene los títulos reales
df_inv = pd.read_excel(archivo_inventario, header=1, engine='openpyxl')
# Limpiamos espacios en los nombres de las columnas
df_inv.columns = [str(c).strip() for c in df_inv.columns]

print(f"Columnas encontradas: {list(df_inv.columns[:5])}...")

df_clean = pd.DataFrame()

# MAPEO ESTRICTO PARA EVITAR ERRORES
# (Evita confundir 'Grupo de Producto' con 'Producto')
def buscar_columna(df, keywords, evitar=[]):
    # 1. Búsqueda exacta primero
    for key in keywords:
        if key in df.columns:
            return key
    # 2. Búsqueda aproximada inteligente
    for col in df.columns:
        # Si la columna contiene palabras prohibidas (ej: 'Grupo'), saltarla
        if any(bad in col for bad in evitar):
            continue
        # Si contiene la keyword deseada
        for key in keywords:
            if key in col:
                return col
    return None

# Definimos qué buscar
col_producto = buscar_columna(df_inv, ['Producto', 'Descripción'], evitar=['Grupo', 'Tipo'])
col_codigo = buscar_columna(df_inv, ['Código Barras', 'Codigo', 'BarCode'])
col_stock = buscar_columna(df_inv, ['Stock', 'Existencia'])
col_costo = buscar_columna(df_inv, ['Costo Neto', 'Costo'])
col_precio = buscar_columna(df_inv, ['Precio Venta', 'Precio'])

# Asignación segura
df_clean['Producto'] = df_inv[col_producto] if col_producto else "SIN NOMBRE"
df_clean['Codigo'] = df_inv[col_codigo] if col_codigo else "S/C"
df_clean['Stock'] = df_inv[col_stock].fillna(0) if col_stock else 0
df_clean['Costo'] = df_inv[col_costo].fillna(0) if col_costo else 0
df_clean['Precio'] = df_inv[col_precio].fillna(0) if col_precio else 0

# Limpieza Numérica
def limpiar_num(val):
    s = re.sub(r'[^\d\-]', '', str(val))
    return int(float(s)) if s else 0

for col in ['Stock', 'Costo', 'Precio']:
    df_clean[col] = df_clean[col].apply(limpiar_num)

# FILTRO CLAVE: Solo eliminamos si no hay nombre de producto
df_clean = df_clean[df_clean['Producto'] != "SIN NOMBRE"]
df_clean = df_clean[df_clean['Producto'].notna()]

# ==========================================
# 2. INTELIGENCIA CENABAST (CATEGORIZACIÓN)
# ==========================================
print("Aplicando Inteligencia de Categorías...")
mapa_cat = {}
if os.path.exists(archivo_cenabast):
    try:
        df_cen = pd.read_csv(archivo_cenabast, on_bad_lines='skip')
        for _, row in df_cen.iterrows():
            nom = str(row.get('Nombre producto genérico','')).upper()
            cat = str(row.get('Clasificación interna','')).strip()
            if len(nom) > 3 and cat not in ['nan','']:
                key = nom.split()[0] # Primera palabra clave
                if key not in mapa_cat: mapa_cat[key] = cat
    except: pass

def get_cat(txt):
    if not isinstance(txt, str): return "OTROS"
    tokens = txt.upper().split()
    for t in tokens:
        if len(t) > 3 and t in mapa_cat: return mapa_cat[t]
    return "SIN CLASIFICAR"

df_clean['Categoria'] = df_clean['Producto'].apply(get_cat)

# ==========================================
# 3. ESTADOS DE NEGOCIO (ESTRATEGIA VALLENAR)
# ==========================================
def definir_estado(row):
    s = row['Stock']
    p = row['Precio']
    if s > 0 and p > 0: return "DISPONIBLE"       # Verde: Vender ya
    if s <= 0 and p > 0: return "POR ENCARGO"     # Amarillo: Pedir
    return "SOLO REFERENCIA"                      # Gris: Info

df_clean['Estado'] = df_clean.apply(definir_estado, axis=1)

# Ordenar: Primero lo Disponible
df_clean.sort_values(by=['Estado', 'Producto'], ascending=[True, True], inplace=True)

# Guardar
df_clean.to_csv(archivo_salida, index=False, sep=';', encoding='utf-8-sig')

print(f"\n¡CORRECCIÓN COMPLETADA!")
print(f"Archivo generado: {archivo_salida}")
print(f"Total Productos Reales: {len(df_clean)}")
print("Resumen de tu Farmacia:")
print(df_clean['Estado'].value_counts())