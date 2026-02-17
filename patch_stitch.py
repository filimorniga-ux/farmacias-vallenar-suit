import fs
import os

file_path = 'node_modules/@_davideast/stitch-mcp/dist/cli.js'
search_text = '_log(`injecting env'
replace_text = '// _log(`injecting env'

if not os.path.exists(file_path):
    print(f"Error: File not found at {file_path}")
    exit(1)

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    if search_text not in content:
        print("Warning: Target string not found. Already patched?")
        # Check if already patched
        if replace_text in content:
            print("File appears to be already patched.")
        exit(0)

    new_content = content.replace(search_text, replace_text)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("Successfully patched cli.js")

except Exception as e:
    print(f"Error patching file: {e}")
    exit(1)
