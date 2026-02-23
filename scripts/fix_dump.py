import re

def process_dump():
    input_file = "timescale_prod.sql"
    output_file = "supabase_ready.sql"

    chunk_map = {}
    
    # Regexes
    table_create_regex = re.compile(r"CREATE TABLE _timescaledb_internal\.(_hyper_\d+_\d+_chunk)\s*\(")
    inherits_regex = re.compile(r"INHERITS\s*\((public\.\w+)\)")
    
    copy_regex = re.compile(r"COPY _timescaledb_internal\.(_hyper_\d+_\d+_chunk)\s*\((.*?)\)\s*FROM stdin;")
    
    # We also want to skip all lines related to _timescaledb_internal
    skip_regex = re.compile(r"^(ALTER|CREATE|DROP|COMMENT) .*_timescaledb_internal")
    
    print("Mapeando Chunks de Hypertablas a tablas normales...")
    
    with open(input_file, "r") as fin, open(output_file, "w") as fout:
        inside_chunk_create = False
        current_chunk = None
        buffer_chunk = []
        
        for line in fin:
            # Detect chunk creation start
            m_create = table_create_regex.search(line)
            if m_create:
                inside_chunk_create = True
                current_chunk = m_create.group(1)
                buffer_chunk = [line]
                continue
            
            if inside_chunk_create:
                buffer_chunk.append(line)
                m_inherits = inherits_regex.search(line)
                if m_inherits:
                    parent_table = m_inherits.group(1)
                    chunk_map[current_chunk] = parent_table
                    print(f"Mapeado: {current_chunk} -> {parent_table}")
                
                # End of CREATE TABLE statement
                if line.strip().endswith(";"):
                    inside_chunk_create = False
                    current_chunk = None
                    # We DO NOT write the chunk CREATE TABLE to output, we drop it.
                continue
            
            # Map COPY statements
            m_copy = copy_regex.search(line)
            if m_copy:
                chunk_name = m_copy.group(1)
                cols = m_copy.group(2)
                parent_table = chunk_map.get(chunk_name)
                
                if parent_table:
                    # Rewrite to target the parent table
                    new_line = f"COPY {parent_table} ({cols}) FROM stdin;\n"
                    fout.write(new_line)
                    continue
                else:
                    print(f"Advertencia: COPY encontrado para chunk desconocido: {chunk_name}")
            
            # Skip _timescaledb_internal configurations (Indexes, constraints, triggers on chunks)
            if skip_regex.search(line):
                continue
            
            # Skip timescaledb extension creations
            if "CREATE EXTENSION IF NOT EXISTS timescaledb" in line:
                continue
            
            # Default write line
            fout.write(line)
            
    print("Transformacion completada: supabase_ready.sql")

if __name__ == "__main__":
    process_dump()
